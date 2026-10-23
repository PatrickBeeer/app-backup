package parser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"financial-dashboard-backend/internal/store"
	"financial-dashboard-backend/internal/util"
)

// UnrecognizedWorkbookError is returned when none of the strategies can find
// any entries in a workbook. The Profile field carries diagnostics for the UI.
type UnrecognizedWorkbookError struct {
	Message string
	Profile map[string]any
}

func (e *UnrecognizedWorkbookError) Error() string { return e.Message }

// Workbook wraps an opened excelize workbook with cached sheet readers.
type Workbook struct {
	File   *excelize.File
	Sheets []SheetData
}

// SheetData is a fully materialized sheet (rows trimmed to actual extent).
type SheetData struct {
	Name string
	Rows [][]string
}

// OpenWorkbook reads the entire workbook into memory.
func OpenWorkbook(path string) (*Workbook, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	wb := &Workbook{File: f}
	for _, name := range f.GetSheetList() {
		rows, err := f.GetRows(name, excelize.Options{RawCellValue: false})
		if err != nil {
			continue
		}
		// Trim trailing empty rows for fewer wasted iterations.
		for len(rows) > 0 {
			last := rows[len(rows)-1]
			allEmpty := true
			for _, v := range last {
				if strings.TrimSpace(v) != "" {
					allEmpty = false
					break
				}
			}
			if !allEmpty {
				break
			}
			rows = rows[:len(rows)-1]
		}
		wb.Sheets = append(wb.Sheets, SheetData{Name: name, Rows: rows})
	}
	return wb, nil
}

// Close releases the workbook resources.
func (w *Workbook) Close() error {
	if w.File != nil {
		return w.File.Close()
	}
	return nil
}

// Sheet returns the sheet by name (matches case-sensitively first, then case
// insensitive).
func (w *Workbook) Sheet(name string) *SheetData {
	for i := range w.Sheets {
		if w.Sheets[i].Name == name {
			return &w.Sheets[i]
		}
	}
	for i := range w.Sheets {
		if strings.EqualFold(w.Sheets[i].Name, name) {
			return &w.Sheets[i]
		}
	}
	return nil
}

// FirstSheet returns the first sheet, or nil for empty workbooks.
func (w *Workbook) FirstSheet() *SheetData {
	if len(w.Sheets) == 0 {
		return nil
	}
	return &w.Sheets[0]
}

// MaxRow returns the row count.
func (s *SheetData) MaxRow() int { return len(s.Rows) }

// MaxColumn returns the maximum column index across all rows.
func (s *SheetData) MaxColumn() int {
	max := 0
	for _, row := range s.Rows {
		if len(row) > max {
			max = len(row)
		}
	}
	return max
}

// Cell returns the trimmed string for a 1-based row/col coordinate.
func (s *SheetData) Cell(row, col int) string {
	if row < 1 || row > len(s.Rows) {
		return ""
	}
	r := s.Rows[row-1]
	if col < 1 || col > len(r) {
		return ""
	}
	return strings.TrimSpace(r[col-1])
}

// CellRaw returns the raw cell value for type conversions.
func (s *SheetData) CellRaw(row, col int) string {
	return s.Cell(row, col)
}

// ParseDetail extracts entries from a "明细数据" style sheet.
func ParseDetail(sheet *SheetData) []*store.Entry {
	if sheet == nil {
		return nil
	}
	entries := []*store.Entry{}
	section := ""
	maxCol := sheet.MaxColumn()
	if maxCol > 4 {
		maxCol = 4
	}
	for row := 1; row <= sheet.MaxRow(); row++ {
		first := sheet.Cell(row, 1)
		secondText := sheet.Cell(row, 2)
		third := sheet.Cell(row, 3)
		fourth := sheet.Cell(row, 4)

		if first == "项目" || first == "收入项目" {
			section = "income"
			continue
		}
		if first == "支出项目" || first == "成本项目" || first == "费用项目" {
			section = "expense"
			continue
		}
		if first == "" && secondText == "" && third == "" && fourth == "" {
			continue
		}
		if section == "" {
			continue
		}
		amount, ok := util.ToNumber(secondText)
		if !ok {
			continue
		}
		var entryType, category string
		if section == "expense" {
			entryType = "expense"
			cat := third
			if cat == "" {
				cat = "未分类成本"
			}
			category = store.NormalizeCostCategory(cat, first)
		} else {
			entryType = store.NormalizeEntryType(third, amount)
			category = store.NormalizeIncomeCategory(third, first)
		}
		entries = append(entries, &store.Entry{
			Name:     first,
			Amount:   amount,
			Type:     entryType,
			Category: category,
			Note:     fourth,
		})
	}
	return entries
}

// ParseSalary scans every sheet for a recognizable salary table and converts
// it into expense entries.
func ParseSalary(wb *Workbook) []*store.Entry {
	for _, sheet := range wb.Sheets {
		header := findSalaryHeader(&sheet)
		if header == nil {
			continue
		}
		entries := []*store.Entry{}
		for row := header.RowIndex + 1; row <= sheet.MaxRow(); row++ {
			name := sheet.Cell(row, header.Columns["姓名"])
			if name == "" {
				continue
			}
			amount, ok := util.ToNumber(sheet.Cell(row, header.Columns["应发合计"]))
			if !ok {
				continue
			}
			var noteParts []string
			if col, ok := header.Columns["部门"]; ok {
				if v := sheet.Cell(row, col); v != "" {
					noteParts = append(noteParts, "部门："+v)
				}
			}
			if col, ok := header.Columns["基本工资"]; ok {
				if v, ok := util.ToNumber(sheet.Cell(row, col)); ok {
					noteParts = append(noteParts, "基本工资："+formatAmount(v))
				}
			}
			if col, ok := header.Columns["提成"]; ok {
				if v, ok := util.ToNumber(sheet.Cell(row, col)); ok && v != 0 {
					noteParts = append(noteParts, "提成："+formatAmount(v))
				}
			}
			if col, ok := header.Columns["实发工资"]; ok {
				if v, ok := util.ToNumber(sheet.Cell(row, col)); ok {
					noteParts = append(noteParts, "实发工资："+formatAmount(v))
				}
			}
			entries = append(entries, &store.Entry{
				Name:       name + "工资",
				Amount:     util.RoundMoney(amount),
				Type:       "expense",
				Category:   "工资成本",
				SourceKind: "salary",
				Note:       strings.Join(noteParts, "；"),
			})
		}
		if len(entries) > 0 {
			return entries
		}
	}
	return nil
}

type headerLayout struct {
	RowIndex int
	Columns  map[string]int
}

func findSalaryHeader(sheet *SheetData) *headerLayout {
	required := []string{"姓名", "应发合计"}
	aliases := map[string][]string{
		"姓名":   {"姓名", "*姓名"},
		"部门":   {"部门"},
		"基本工资": {"基本工资", "底薪"},
		"提成":   {"提成", "绩效", "奖金"},
		"应发合计": {"应发合计", "应发工资", "工资合计"},
		"实发工资": {"实发工资", "实发合计"},
	}
	maxRow := sheet.MaxRow()
	if maxRow > 30 {
		maxRow = 30
	}
	for row := 1; row <= maxRow; row++ {
		columns := map[string]int{}
		for col := 1; col <= sheet.MaxColumn(); col++ {
			value := sheet.Cell(row, col)
			for canonical, options := range aliases {
				for _, candidate := range options {
					if value == candidate {
						columns[canonical] = col
						break
					}
				}
			}
		}
		ok := true
		for _, key := range required {
			if _, found := columns[key]; !found {
				ok = false
				break
			}
		}
		if ok {
			return &headerLayout{RowIndex: row, Columns: columns}
		}
	}
	return nil
}

// ParseEnrollment finds enrollment-style sheets and turns them into income or
// refund entries.
func ParseEnrollment(wb *Workbook, monthID string) []*store.Entry {
	matched := []*store.Entry{}
	fallbacks := [][]*store.Entry{}
	for _, sheet := range wb.Sheets {
		header := findEnrollmentHeader(&sheet)
		if header == nil {
			continue
		}
		entries := []*store.Entry{}
		for row := header.RowIndex + 1; row <= sheet.MaxRow(); row++ {
			name := sheet.Cell(row, header.Columns["姓名"])
			amount, ok := util.ToNumber(sheet.Cell(row, header.Columns["成交价格"]))
			if name == "" || !ok {
				continue
			}
			paymentMethod := optionalCell(&sheet, row, header.Columns, "付款方式")
			paymentTime := optionalCell(&sheet, row, header.Columns, "付款时间")
			courseNote := optionalCell(&sheet, row, header.Columns, "课程备注")
			paymentNote := optionalCell(&sheet, row, header.Columns, "付款备注")
			salesperson := optionalCell(&sheet, row, header.Columns, "销售人员和销售微信号")
			courseDate := optionalCell(&sheet, row, header.Columns, "上课时间")
			parts := []string{}
			if paymentMethod != "" {
				parts = append(parts, "付款方式："+paymentMethod)
			}
			if paymentTime != "" {
				parts = append(parts, "付款时间："+paymentTime)
			}
			if courseDate != "" {
				parts = append(parts, "上课时间："+courseDate)
			}
			if courseNote != "" {
				parts = append(parts, "课程备注："+courseNote)
			}
			if paymentNote != "" {
				parts = append(parts, "备注："+paymentNote)
			}
			if salesperson != "" {
				parts = append(parts, "销售："+salesperson)
			}
			textForRefund := strings.ToLower(courseNote + " " + paymentNote)
			isRefund := strings.Contains(textForRefund, "退款") || strings.Contains(textForRefund, "已退")
			category := "线下课营收"
			amt := amount
			entryType := "income"
			if isRefund {
				entryType = "refund"
				amt = -abs(amt)
				category = "退款"
			}
			entry := &store.Entry{
				Name:       name + "线下课",
				Amount:     amt,
				Type:       entryType,
				Category:   category,
				SourceKind: "enrollment",
				Note:       strings.Join(parts, "；"),
			}
			entries = append(entries, entry)
			if rowMatchesEnrollmentMonth(monthID, paymentTime, courseDate, []string{courseNote, paymentNote, salesperson}) {
				matched = append(matched, entry)
			}
		}
		if len(entries) > 0 {
			fallbacks = append(fallbacks, entries)
		}
	}
	if len(matched) > 0 {
		return matched
	}
	if len(fallbacks) == 1 {
		return fallbacks[0]
	}
	return nil
}

func findEnrollmentHeader(sheet *SheetData) *headerLayout {
	aliases := map[string][]string{
		"姓名":              {"姓名", "名字"},
		"成交价格":            {"成交价格", "成交价格/定金", "金额", "成交金额"},
		"付款方式":            {"付款方式"},
		"付款时间":            {"付款时间", "报名时间", "付款"},
		"上课时间":            {"几号上课", "备注（几号来上课）"},
		"销售人员和销售微信号": {"销售人员和销售微信号", "销售", "负责人"},
	}
	maxRow := sheet.MaxRow()
	if maxRow > 20 {
		maxRow = 20
	}
	for row := 1; row <= maxRow; row++ {
		columns := map[string]int{}
		var remarks []int
		for col := 1; col <= sheet.MaxColumn(); col++ {
			value := sheet.Cell(row, col)
			if value == "备注" {
				remarks = append(remarks, col)
			}
			for canonical, options := range aliases {
				for _, candidate := range options {
					if headerMatches(value, candidate) {
						columns[canonical] = col
						break
					}
				}
			}
		}
		if _, ok := columns["姓名"]; !ok {
			continue
		}
		if _, ok := columns["成交价格"]; !ok {
			continue
		}
		if len(remarks) > 0 {
			columns["课程备注"] = remarks[0]
		}
		if len(remarks) > 1 {
			columns["付款备注"] = remarks[len(remarks)-1]
		}
		return &headerLayout{RowIndex: row, Columns: columns}
	}
	return nil
}

// ParseHint mirrors extract_hint_entries: a parse hint determines which sign
// and category to apply to numeric data found in any sheet.
func ParseHint(wb *Workbook, monthID, parseHint string) []*store.Entry {
	mode := store.HintMode(parseHint)
	if mode == "" {
		return nil
	}
	candidates := []*store.Entry{}
	monthSuffix, _ := strconv.Atoi(strings.SplitN(monthID, "-", 2)[1])
	for _, sheet := range wb.Sheets {
		header := findGenericHeader(&sheet)
		if header == nil {
			continue
		}
		amountCol := chooseAmountColumn(header.Columns, parseHint)
		if amountCol == 0 {
			continue
		}
		nameCol := header.Columns["name"]
		dateCol := header.Columns["date"]
		var noteCols []int
		for label, col := range header.Columns {
			if label == "amount" || label == "name" || label == "date" {
				continue
			}
			noteCols = append(noteCols, col)
			if len(noteCols) >= 3 {
				break
			}
		}
		for row := header.RowIndex + 1; row <= sheet.MaxRow(); row++ {
			amount, ok := util.ToNumber(sheet.Cell(row, amountCol))
			if !ok {
				continue
			}
			if dateCol != 0 {
				dateValue := sheet.Cell(row, dateCol)
				monthsFound := extractMonthNumbers(dateValue)
				if len(monthsFound) > 0 {
					match := false
					for _, m := range monthsFound {
						if m == monthSuffix {
							match = true
							break
						}
					}
					if !match {
						continue
					}
				}
			}
			name := ""
			if nameCol != 0 {
				name = sheet.Cell(row, nameCol)
			}
			if name == "" {
				name = sheet.Name
			}
			notes := []string{}
			for _, col := range noteCols {
				if v := sheet.Cell(row, col); v != "" {
					notes = append(notes, v)
				}
			}
			category := store.HintCategory(parseHint, mode)
			amt := abs(amount)
			if mode == "refund" {
				amt = -amt
				category = "退款"
			}
			candidates = append(candidates, &store.Entry{
				Name:       util.FirstNonEmpty(name, category),
				Amount:     amt,
				Type:       mode,
				Category:   category,
				SourceKind: "hint",
				Note:       strings.Join(notes, "；"),
			})
		}
	}
	return candidates
}

func findGenericHeader(sheet *SheetData) *headerLayout {
	maxRow := sheet.MaxRow()
	if maxRow > 25 {
		maxRow = 25
	}
	for row := 1; row <= maxRow; row++ {
		columns := map[string]int{}
		for col := 1; col <= sheet.MaxColumn(); col++ {
			value := sheet.Cell(row, col)
			if value == "" {
				continue
			}
			normalized := normalizeHeader(value)
			matched := false
			for _, key := range []string{"金额", "价格", "合计", "工资", "费用", "成本"} {
				if strings.Contains(normalized, key) {
					if _, exists := columns["amount"]; !exists {
						columns["amount"] = col
					}
					columns[value] = col
					matched = true
					break
				}
			}
			if matched {
				continue
			}
			for _, key := range []string{"姓名", "名字", "名称", "项目"} {
				if strings.Contains(normalized, key) {
					if _, exists := columns["name"]; !exists {
						columns["name"] = col
					}
					columns[value] = col
					matched = true
					break
				}
			}
			if matched {
				continue
			}
			for _, key := range []string{"日期", "时间"} {
				if strings.Contains(normalized, key) {
					if _, exists := columns["date"]; !exists {
						columns["date"] = col
					}
					columns[value] = col
					matched = true
					break
				}
			}
			if matched {
				continue
			}
			columns[value] = col
		}
		if _, ok := columns["amount"]; !ok {
			continue
		}
		if _, hasName := columns["name"]; hasName || len(columns) >= 3 {
			return &headerLayout{RowIndex: row, Columns: columns}
		}
	}
	return nil
}

func chooseAmountColumn(columns map[string]int, parseHint string) int {
	hintNorm := normalizeHeader(parseHint)
	for label, col := range columns {
		if label == "amount" || label == "name" || label == "date" {
			continue
		}
		labelNorm := normalizeHeader(label)
		if labelNorm != "" && strings.Contains(hintNorm, labelNorm) {
			return col
		}
	}
	return columns["amount"]
}

func normalizeHeader(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, " ", "")
	value = strings.ReplaceAll(value, "\t", "")
	value = strings.ReplaceAll(value, "\n", "")
	value = strings.ReplaceAll(value, "、", "")
	value = strings.ReplaceAll(value, "/", "")
	return value
}

func headerMatches(value, alias string) bool {
	a := normalizeHeader(value)
	b := normalizeHeader(alias)
	if a == "" || b == "" {
		return false
	}
	return a == b || strings.Contains(a, b)
}

func optionalCell(sheet *SheetData, row int, columns map[string]int, key string) string {
	col, ok := columns[key]
	if !ok || col == 0 {
		return ""
	}
	return sheet.Cell(row, col)
}

func formatAmount(value float64) string {
	if value == float64(int64(value)) {
		return formatThousands(int64(value))
	}
	return fmt.Sprintf("%s.%02d", formatThousands(int64(value)), int(util.RoundMoney(value*100))%100)
}

func formatThousands(value int64) string {
	negative := value < 0
	if negative {
		value = -value
	}
	digits := strconv.FormatInt(value, 10)
	n := len(digits)
	if n <= 3 {
		if negative {
			return "-" + digits
		}
		return digits
	}
	first := n % 3
	parts := []string{}
	if first > 0 {
		parts = append(parts, digits[:first])
	}
	for i := first; i < n; i += 3 {
		parts = append(parts, digits[i:i+3])
	}
	out := strings.Join(parts, ",")
	if negative {
		return "-" + out
	}
	return out
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func rowMatchesEnrollmentMonth(monthID, paymentTime, courseDate string, noteValues []string) bool {
	target, _ := strconv.Atoi(strings.SplitN(monthID, "-", 2)[1])
	pm := extractMonthNumbers(paymentTime)
	if len(pm) > 0 {
		for _, m := range pm {
			if m == target {
				return true
			}
		}
		return false
	}
	cm := extractMonthNumbers(courseDate)
	if len(cm) > 0 {
		for _, m := range cm {
			if m == target {
				return true
			}
		}
		return false
	}
	hay := strings.TrimSpace(strings.Join(noteValues, " "))
	if hay == "" {
		return false
	}
	if containsChineseMonth(hay, target) {
		return true
	}
	for _, m := range extractMonthNumbers(hay) {
		if m == target {
			return true
		}
	}
	return false
}

func containsChineseMonth(text string, month int) bool {
	chinese := map[int]string{
		1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六",
		7: "七", 8: "八", 9: "九", 10: "十", 11: "十一", 12: "十二",
	}
	return strings.Contains(text, fmt.Sprintf("%d月", month)) || strings.Contains(text, chinese[month]+"月")
}

var (
	monthExpr1 = regexp.MustCompile(`(?:20)?\d{2}[./-](1[0-2]|0?[1-9])(?:[./-]\d{1,2})?`)
	monthExpr2 = regexp.MustCompile(`(^|[^\d])(1[0-2]|0?[1-9])[./-]\d{1,2}([^\d]|$)`)
	digitOnly  = regexp.MustCompile(`^\d+(\.\d+)?$`)
)

func extractMonthNumbers(text string) []int {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	out := []int{}
	if m := excelSerialMonth(text); m > 0 {
		out = append(out, m)
	}
	for _, match := range monthExpr1.FindAllStringSubmatch(text, -1) {
		if v, err := strconv.Atoi(match[1]); err == nil {
			out = append(out, v)
		}
	}
	for _, match := range monthExpr2.FindAllStringSubmatch(text, -1) {
		if v, err := strconv.Atoi(match[2]); err == nil {
			out = append(out, v)
		}
	}
	return out
}

func excelSerialMonth(text string) int {
	t := strings.TrimSpace(text)
	if !digitOnly.MatchString(t) {
		return 0
	}
	serial, err := strconv.ParseFloat(t, 64)
	if err != nil || serial < 30000 {
		return 0
	}
	// Excel epoch for the 1900 date system, accounting for the legacy
	// 1900-02-29 leap day bug used by Excel.
	base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
	when := base.Add(time.Duration(serial * 24 * float64(time.Hour)))
	return int(when.Month())
}
