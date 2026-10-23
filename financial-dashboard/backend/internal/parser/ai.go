package parser

import (
	"encoding/json"
	"fmt"
	"strings"

	"financial-dashboard-backend/internal/aiclient"
	"financial-dashboard-backend/internal/store"
	"financial-dashboard-backend/internal/util"
)

// AIEntries normalizes the JSON object returned by an AI call into entries.
func AIEntries(result map[string]any, sourceKind string) []*store.Entry {
	if result == nil {
		return nil
	}
	rawEntries, ok := result["entries"].([]any)
	if !ok {
		return nil
	}
	entries := []*store.Entry{}
	for _, item := range rawEntries {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		entryType := util.CleanText(row["type"])
		if !store.IsAllowedType(entryType) {
			continue
		}
		amount, ok := util.ToNumber(row["amount"])
		if !ok || amount == 0 {
			continue
		}
		category := util.CleanText(row["category"])
		name := util.CleanText(row["name"])
		switch entryType {
		case "expense":
			if category == "" {
				category = "未分类成本"
			}
			category = store.NormalizeCostCategory(category, name)
			amount = abs(amount)
		case "refund":
			category = "退款"
			amount = -abs(amount)
		default:
			amount = abs(amount)
			if category == "" {
				category = "课程营收"
			}
		}
		if name == "" {
			name = category
		}
		entries = append(entries, &store.Entry{
			Name:       name,
			Amount:     util.RoundMoney(amount),
			Type:       entryType,
			Category:   category,
			SourceKind: sourceKind,
			Note:       util.CleanText(row["note"]),
		})
	}
	return entries
}

// WorkbookSample renders a JSON-serializable summary of a workbook for the AI
// prompt. Mirrors the Python workbook_sample helper.
func WorkbookSample(wb *Workbook) map[string]any {
	sheets := []map[string]any{}
	for i, sheet := range wb.Sheets {
		if i >= 8 {
			break
		}
		rows := [][]any{}
		maxRows := sheet.MaxRow()
		if maxRows > 35 {
			maxRows = 35
		}
		maxCols := sheet.MaxColumn()
		if maxCols > 16 {
			maxCols = 16
		}
		for row := 1; row <= maxRows && len(rows) < 24; row++ {
			values := make([]any, 0, maxCols)
			hasContent := false
			for col := 1; col <= maxCols; col++ {
				cell := sheet.Cell(row, col)
				values = append(values, cell)
				if cell != "" {
					hasContent = true
				}
			}
			if hasContent {
				rows = append(rows, values)
			}
		}
		sheets = append(sheets, map[string]any{
			"name":       sheet.Name,
			"rows":       sheet.MaxRow(),
			"columns":    sheet.MaxColumn(),
			"sampleRows": rows,
		})
	}
	return map[string]any{"sheets": sheets}
}

// InspectWorkbookProfile builds the diagnostic profile returned by
// UnrecognizedWorkbookError.
func InspectWorkbookProfile(wb *Workbook) map[string]any {
	sheets := []map[string]any{}
	for i, sheet := range wb.Sheets {
		if i >= 8 {
			break
		}
		headers := firstNonemptyRow(&sheet)
		if len(headers) > 14 {
			headers = headers[:14]
		}
		sheets = append(sheets, map[string]any{
			"name":    sheet.Name,
			"rows":    sheet.MaxRow(),
			"columns": sheet.MaxColumn(),
			"headers": headers,
		})
	}
	return map[string]any{"sheets": sheets}
}

func firstNonemptyRow(sheet *SheetData) []string {
	maxRow := sheet.MaxRow()
	if maxRow > 30 {
		maxRow = 30
	}
	maxCol := sheet.MaxColumn()
	if maxCol > 18 {
		maxCol = 18
	}
	for row := 1; row <= maxRow; row++ {
		values := []string{}
		hasContent := false
		for col := 1; col <= maxCol; col++ {
			value := sheet.Cell(row, col)
			values = append(values, value)
			if value != "" {
				hasContent = true
			}
		}
		if hasContent {
			compact := []string{}
			for _, v := range values {
				if v != "" {
					compact = append(compact, v)
				}
			}
			return compact
		}
	}
	return nil
}

// AIWorkbookEntries asks the configured AI provider to extract entries.
func AIWorkbookEntries(ai *aiclient.Client, wb *Workbook, monthID, parseHint string) ([]*store.Entry, error) {
	context := map[string]any{
		"monthId":           monthID,
		"monthLabel":        util.MonthLabel(monthID),
		"userHint":          parseHint,
		"workbook":          WorkbookSample(wb),
		"allowedCategories": store.AllowedCategories(),
	}
	prompt := "你是财务表格解析助手。请根据工作簿的表头和样例行，提取可以入账到财务看板的明细。" +
		"只返回 JSON，格式为 {\"entries\":[...]}。每条明细字段：name, amount, type, category, note。" +
		"type 只能是 income、expense、refund、adjustment。income/expense/adjustment 的 amount 用正数，refund 用负数。" +
		"需要自动抓取看板所需数据，包括收入、退款、支出、工资成本、佣金、投放、报销杂项、办公固定成本等。" +
		"优先只提取目标月份相关行；如果整张表明显就是目标月份但没有日期列，可以保留。" +
		"不要编造数据；不要重复提取合计行和明细行，如果存在明细，优先用明细。" +
		"成本分类尽量归到工资成本、佣金支付、投放费用、报销及杂项、办公固定成本等可读类别。"
	if ai.GeminiAPIKey() != "" {
		ctxBytes, _ := json.Marshal(context)
		full := prompt + "\n上下文：" + string(ctxBytes)
		result, err := ai.CallGeminiJSON([]map[string]any{{"text": full}})
		if err != nil {
			return nil, err
		}
		return AIEntries(result, "ai"), nil
	}
	result, err := ai.CallOpenAIStructured(prompt, context)
	if err != nil {
		return nil, err
	}
	return AIEntries(result, "ai"), nil
}

// AIImageEntries asks the configured AI provider to extract entries from an
// image attachment.
func AIImageEntries(ai *aiclient.Client, imagePath, monthID, parseHint string) ([]*store.Entry, error) {
	context := map[string]any{
		"monthId":           monthID,
		"monthLabel":        util.MonthLabel(monthID),
		"userHint":          parseHint,
		"allowedCategories": store.AllowedCategories(),
	}
	prompt := "你是财务截图识别助手。请阅读图片中的表格、聊天截图、收款截图或报销截图，" +
		"提取可以入账到财务看板的明细。只返回 JSON，格式为 {\"entries\":[...]}。" +
		"每条明细字段：name, amount, type, category, note。type 只能是 income、expense、refund、adjustment。" +
		"income/expense/adjustment 的 amount 用正数，refund 用负数。" +
		"不要编造看不清的内容；不要重复提取合计行和明细行，如果存在明细，优先用明细。" +
		"优先只提取目标月份相关行；如果截图明显就是目标月份但没有日期，可以保留。" +
		"成本分类尽量归到工资成本、佣金支付、投放费用、报销及杂项、办公固定成本、技术/录播费用等类别。" +
		"备注里保留付款方式、日期、销售、截图中可核对的关键信息。"
	if ai.GeminiAPIKey() != "" {
		encoded, err := aiclient.EncodedImage(imagePath)
		if err != nil {
			return nil, &aiclient.RecognitionError{Message: "无法读取截图：" + err.Error()}
		}
		ctxBytes, _ := json.Marshal(context)
		parts := []map[string]any{
			{"text": prompt + "\n上下文：" + string(ctxBytes)},
			{"inline_data": map[string]any{
				"mime_type": aiclient.ImageMimeType(imagePath),
				"data":      encoded,
			}},
		}
		result, err := ai.CallGeminiJSON(parts)
		if err != nil {
			return nil, err
		}
		return AIEntries(result, "ai-image"), nil
	}
	ctxBytes, _ := json.Marshal(context)
	userText := "请识别这张图片并生成财务明细。\n上下文：" + string(ctxBytes)
	result, err := ai.CallOpenAIWithImage(prompt, userText, imagePath)
	if err != nil {
		return nil, err
	}
	return AIEntries(result, "ai-image"), nil
}

// AITextEntries asks the configured AI provider to extract entries from
// free-form text.
func AITextEntries(ai *aiclient.Client, text, monthID, parseHint string) ([]*store.Entry, error) {
	context := map[string]any{
		"monthId":           monthID,
		"monthLabel":        util.MonthLabel(monthID),
		"userHint":          parseHint,
		"text":              text,
		"allowedCategories": store.AllowedCategories(),
	}
	prompt := "你是财务文字录入助手。请把用户输入的自然语言、聊天记录或粘贴的账目内容，" +
		"转换成可以入账到财务看板的结构化明细。只返回 JSON，格式为 {\"entries\":[...]}。" +
		"每条明细字段：name, amount, type, category, note。type 只能是 income、expense、refund、adjustment。" +
		"income/expense/adjustment 的 amount 用正数，refund 用负数。" +
		"不要编造金额；没有明确金额的内容不要生成明细。" +
		"如果一句话里有多笔收入、支出或退款，请拆成多条。" +
		"成本分类尽量归到工资成本、佣金支付、投放费用、报销及杂项、办公固定成本、技术/录播费用等类别。"
	if ai.GeminiAPIKey() != "" {
		ctxBytes, _ := json.Marshal(context)
		full := prompt + "\n上下文：" + string(ctxBytes)
		result, err := ai.CallGeminiJSON([]map[string]any{{"text": full}})
		if err != nil {
			return nil, err
		}
		return AIEntries(result, "ai-text"), nil
	}
	result, err := ai.CallOpenAIStructured(prompt, context)
	if err != nil {
		return nil, err
	}
	return AIEntries(result, "ai-text"), nil
}

// ChatEditContext is the JSON-serializable context handed to the AI for
// resolving chat-edit instructions.
type ChatEditContext struct {
	MonthID    string                  `json:"monthId"`
	MonthLabel string                  `json:"monthLabel"`
	Hint       string                  `json:"instruction"`
	HasImage   bool                    `json:"hasImage"`
	Categories []string                `json:"categories"`
	Entries    []map[string]any        `json:"entries"`
}

// BuildChatEditContext builds the context payload from a month snapshot.
func BuildChatEditContext(monthData *store.MonthData, instruction string, hasImage bool) ChatEditContext {
	entries := []map[string]any{}
	categorySet := map[string]struct{}{}
	for index, entry := range monthData.Entries {
		categorySet[entry.Category] = struct{}{}
		note := entry.Note
		if len([]rune(note)) > 120 {
			note = util.TruncateRunes(note, 120)
		}
		entries = append(entries, map[string]any{
			"index":    index + 1,
			"name":     entry.Name,
			"type":     entry.Type,
			"category": entry.Category,
			"amount":   entry.Amount,
			"note":     note,
		})
		if len(entries) >= 120 {
			break
		}
	}
	categories := make([]string, 0, len(categorySet))
	for c := range categorySet {
		if c != "" {
			categories = append(categories, c)
		}
	}
	return ChatEditContext{
		MonthID:    monthData.ID,
		MonthLabel: monthData.Label,
		Hint:       instruction,
		HasImage:   hasImage,
		Categories: categories,
		Entries:    entries,
	}
}

// ChatEditPrompt mirrors the Python prompt used to turn natural language
// instructions into discrete JSON actions.
func ChatEditPrompt(ctx ChatEditContext) string {
	bytes, _ := json.Marshal(ctx)
	return strings.Join([]string{
		"你是财务看板的数据修正助手。请把用户的自然语言修改指令转换成 JSON 操作。",
		"只返回 JSON，格式为 {\"actions\":[...]}。允许的 action：",
		"rename_category: {action, fromCategory, toCategory}; ",
		"update_entry: {action, index, name, type, category, amount, note}; ",
		"delete_entry: {action, index}; ",
		"delete_matching: {action, type, category, nameContains, noteContains}。",
		"index 使用上下文里的 1 基序号。type 只能是 income、expense、refund、adjustment。",
		"如果用户只说修改分类名称，优先使用 rename_category。",
		"如果用户说删除全部、所有、这一类等批量删除，请优先使用 delete_matching，并至少填写 type、category、nameContains 或 noteContains 之一。",
		"如果无法唯一确定要改哪条明细，不要猜，返回空 actions。",
		"不要新增收入或支出；这里只处理修正、删除和分类重命名。",
		"如果用户上传了截图，请根据截图内容和当前明细进行比对后生成修正操作。",
		"\n上下文：",
		string(bytes),
	}, "")
}

// ChatEditWithImagePrompt returns the structured prompt without the JSON
// context so the caller can attach the image part.
func ChatEditTextOnlyPrompt(ctx ChatEditContext) string {
	return ChatEditPrompt(ctx)
}

// ChatEditExtract calls the configured AI to materialize an action plan.
func ChatEditExtract(ai *aiclient.Client, ctx ChatEditContext, imagePath string) (map[string]any, error) {
	if ai.GeminiAPIKey() != "" {
		parts := []map[string]any{{"text": ChatEditPrompt(ctx)}}
		if imagePath != "" {
			encoded, err := aiclient.EncodedImage(imagePath)
			if err != nil {
				return nil, &aiclient.RecognitionError{Message: "无法读取截图：" + err.Error()}
			}
			parts = append(parts, map[string]any{
				"inline_data": map[string]any{
					"mime_type": aiclient.ImageMimeType(imagePath),
					"data":      encoded,
				},
			})
		}
		return ai.CallGeminiJSON(parts)
	}
	if imagePath != "" {
		return nil, &aiclient.RecognitionError{Message: "当前对话截图修改需要 GEMINI_API_KEY。"}
	}
	return ai.CallOpenAIJSON(ChatEditPrompt(ctx))
}

// EnsureNonEmpty trims to a default if empty.
func EnsureNonEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

// GoStringPtr is a small convenience that copies a string for environments
// that want pointer semantics. Unused at runtime but kept as documentation.
func GoStringPtr(s string) *string { v := s; return &v }

// Sprintf is a thin wrapper that keeps imports tidy.
func Sprintf(format string, args ...any) string { return fmt.Sprintf(format, args...) }
