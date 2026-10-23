package server

import (
    "context"
    "encoding/csv"
    "fmt"
    "math"
    "os"
    "strconv"
    "strings"

    "financial-dashboard-backend/internal/aiclient"
    "financial-dashboard-backend/internal/excelparser"
    "financial-dashboard-backend/internal/parser"
    "financial-dashboard-backend/internal/store"
    "financial-dashboard-backend/internal/util"
)

type excelImportConfig struct {
    MaxSheetRows    int
    ImageBatchLimit int
    ImageTotalLimit int
}

func loadExcelImportConfig() excelImportConfig {
    return excelImportConfig{
        MaxSheetRows:    envInt("MAX_SHEET_ROWS", 200, 1, 2000),
        ImageBatchLimit: envInt("IMAGE_BATCH_LIMIT", 6, 1, 20),
        ImageTotalLimit: envInt("IMAGE_TOTAL_LIMIT", 24, 0, 200),
    }
}

func envInt(key string, fallback, min, max int) int {
    raw := strings.TrimSpace(os.Getenv(key))
    if raw == "" {
        return fallback
    }
    parsed, err := strconv.Atoi(raw)
    if err != nil {
        return fallback
    }
    if parsed < min {
        return min
    }
    if parsed > max {
        return max
    }
    return parsed
}

func (s *Server) llmExcelEntries(ctx context.Context, parsed *excelparser.ParseResponse, monthID, parseHint string, batchSize int) ([]*store.Entry, error) {
    if parsed == nil {
        return nil, fmt.Errorf("excel-parser response is empty")
    }
    batches := chunkImageBatches(parsed.Images, batchSize)
    if len(batches) == 0 {
        batches = [][]excelparser.ImagePreview{{}}
    }

    entries := []*store.Entry{}
    for _, batch := range batches {
        system, user := parser.BuildExcelLLMPrompt(parser.ExcelLLMPayload{
            MonthID:  monthID,
            UserHint: parseHint,
            Sheets:   parsed.Sheets,
            Images:   batch,
        })
        parts := []map[string]any{{"text": user}}
        for _, img := range batch {
            parts = append(parts, map[string]any{
                "inline_data": map[string]any{
                    "mime_type": img.MimeType,
                    "data":      img.Base64,
                },
            })
        }
        req := aiclient.LLMGenerateRequest{
            Model: "gemini-3-flash-preview",
            Contents: map[string]any{
                "role":  "user",
                "parts": parts,
            },
            SystemInstruction: map[string]any{
                "parts": []map[string]any{{"text": system}},
            },
            Config: map[string]any{
                "temperature":      0,
                "responseMimeType": "application/json",
            },
        }
        result, err := s.ai.CallAPIManagerJSON(ctx, req)
        if err != nil {
            return nil, err
        }
        batchEntries := parser.AIEntries(result, "ai")
        if batchEntries == nil {
            return nil, &aiclient.RecognitionError{Message: "AI识别结果不是可读取的 JSON。"}
        }
        entries = append(entries, batchEntries...)
    }

    entries = dedupeEntries(entries)
    if len(entries) == 0 {
        entries = fallbackExcelEntries(parsed)
    }
    return dedupeEntries(entries), nil
}

func chunkImageBatches(images []excelparser.ImagePreview, size int) [][]excelparser.ImagePreview {
    if len(images) == 0 {
        return nil
    }
    if size <= 0 || size >= len(images) {
        return [][]excelparser.ImagePreview{images}
    }
    batches := make([][]excelparser.ImagePreview, 0, (len(images)+size-1)/size)
    for i := 0; i < len(images); i += size {
        end := i + size
        if end > len(images) {
            end = len(images)
        }
        batches = append(batches, images[i:end])
    }
    return batches
}

func dedupeEntries(entries []*store.Entry) []*store.Entry {
    if len(entries) == 0 {
        return entries
    }
    seen := map[string]struct{}{}
    out := make([]*store.Entry, 0, len(entries))
    for _, entry := range entries {
        if entry == nil {
            continue
        }
        key := fmt.Sprintf("%s|%s|%s|%s|%.2f", strings.TrimSpace(entry.Name), entry.Type, entry.Category, strings.TrimSpace(entry.Note), entry.Amount)
        if _, ok := seen[key]; ok {
            continue
        }
        seen[key] = struct{}{}
        out = append(out, entry)
    }
    return out
}

func fallbackExcelEntries(parsed *excelparser.ParseResponse) []*store.Entry {
    if parsed == nil {
        return nil
    }
    entries := make([]*store.Entry, 0)
    for _, sheet := range parsed.Sheets {
        entries = append(entries, fallbackEntriesFromSheet(sheet)...)
    }
    return dedupeEntries(entries)
}

func fallbackEntriesFromSheet(sheet excelparser.SheetPreview) []*store.Entry {
    if len(sheet.Rows) == 0 {
        return nil
    }
    headerIdx := -1
    headerMap := map[string]int{}
    for idx, row := range sheet.Rows {
        mapped := mapExpenseHeaderIndexes(row)
        if len(mapped) == 0 {
            continue
        }
        if _, ok := mapped["amount"]; !ok {
            continue
        }
        if _, ok := mapped["name"]; !ok {
            continue
        }
        headerIdx = idx
        headerMap = mapped
        break
    }
    if headerIdx < 0 {
        return nil
    }

    out := make([]*store.Entry, 0)
    for _, row := range sheet.Rows[headerIdx+1:] {
        entry := fallbackEntryFromRow(sheet.Name, row, headerMap)
        if entry != nil {
            out = append(out, entry)
        }
    }
    return out
}

func mapExpenseHeaderIndexes(row []string) map[string]int {
    mapped := map[string]int{}
    for idx, cell := range row {
        normalized := normalizeExpenseHeader(cell)
        switch normalized {
        case "name", "amount", "category", "note", "date":
            if _, exists := mapped[normalized]; !exists {
                mapped[normalized] = idx
            }
        }
    }
    return mapped
}

func normalizeExpenseHeader(value string) string {
    text := strings.ToLower(strings.TrimSpace(value))
    text = strings.ReplaceAll(text, " ", "")
    switch text {
    case "报销原因", "支出项目", "项目", "事项", "费用项", "费用项目":
        return "name"
    case "付款金额", "金额", "支出金额", "报销金额", "实付金额":
        return "amount"
    case "分类", "费用分类", "成本分类":
        return "category"
    case "备注", "说明":
        return "note"
    case "日期", "时间", "发生日期":
        return "date"
    default:
        return ""
    }
}

func fallbackEntryFromRow(sheetName string, row []string, headerMap map[string]int) *store.Entry {
    name := cleanSheetCell(rowValue(row, headerMap["name"]))
    amountText := cleanSheetCell(rowValue(row, headerMap["amount"]))
    if name == "" || amountText == "" {
        return nil
    }
    loweredName := strings.ToLower(strings.TrimSpace(name))
    if strings.Contains(loweredName, "总计") || strings.Contains(loweredName, "合计") {
        return nil
    }
    amount, ok := util.ToNumber(amountText)
    if !ok || amount == 0 {
        return nil
    }

    rawCategory := cleanSheetCell(rowValue(row, headerMap["category"]))
    if rawCategory == "" {
        rawCategory = "报销及杂项"
    }
    category := store.NormalizeCostCategory(rawCategory, name)

    noteParts := make([]string, 0, 2)
    if dateIdx, ok := headerMap["date"]; ok {
        if date := cleanSheetCell(rowValue(row, dateIdx)); date != "" {
            noteParts = append(noteParts, "日期:"+date)
        }
    }
    if noteIdx, ok := headerMap["note"]; ok {
        if note := cleanSheetCell(rowValue(row, noteIdx)); note != "" {
            noteParts = append(noteParts, note)
        }
    }
    if strings.TrimSpace(sheetName) != "" {
        noteParts = append(noteParts, "sheet:"+strings.TrimSpace(sheetName))
    }

    return &store.Entry{
        Name:       name,
        Amount:     util.RoundMoney(math.Abs(amount)),
        Type:       "expense",
        Category:   category,
        SourceKind: "ai",
        Note:       strings.Join(noteParts, "；"),
    }
}

func rowValue(row []string, idx int) string {
    if idx < 0 || idx >= len(row) {
        return ""
    }
    return row[idx]
}

func cleanSheetCell(value string) string {
    text := strings.ReplaceAll(value, "\u00a0", " ")
    text = strings.TrimSpace(text)
    return strings.Trim(text, "\"")
}

func buildExcelProfile(parsed *excelparser.ParseResponse, parseHint string) map[string]any {
    sheets := []map[string]any{}
    imageCount := 0
    if parsed != nil {
        for _, sheet := range parsed.Sheets {
            sheets = append(sheets, map[string]any{
                "name":    sheet.Name,
                "rows":    sheet.TotalRows,
                "columns": sheet.TotalCols,
            })
        }
        imageCount = len(parsed.Images)
    }
    profile := map[string]any{
        "sheets":     sheets,
        "imageCount": imageCount,
    }
    if strings.TrimSpace(parseHint) != "" {
        profile["userHint"] = parseHint
    }
    return profile
}

func excelTitleFromSheets(parsed *excelparser.ParseResponse, monthID string) string {
    if parsed != nil {
        for _, sheet := range parsed.Sheets {
            if sheet.Name == "老板经营看板" || strings.Contains(sheet.Name, "经营看板") {
                if title := firstCSVCell(sheet.CSV); title != "" {
                    return title
                }
            }
        }
    }
    return util.MonthLabel(monthID) + "财务报表"
}

func firstCSVCell(csvText string) string {
    if strings.TrimSpace(csvText) == "" {
        return ""
    }
    reader := csv.NewReader(strings.NewReader(csvText))
    row, err := reader.Read()
    if err != nil || len(row) == 0 {
        return ""
    }
    return strings.TrimSpace(row[0])
}
