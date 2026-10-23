package parser

import (
    "encoding/json"
    "strings"

    "financial-dashboard-backend/internal/excelparser"
    "financial-dashboard-backend/internal/store"
    "financial-dashboard-backend/internal/util"
)

// ExcelLLMPayload holds the context for LLM-based Excel parsing.
type ExcelLLMPayload struct {
    MonthID  string
    UserHint string
    Sheets   []excelparser.SheetPreview
    Images   []excelparser.ImagePreview
}

// BuildExcelLLMPrompt builds system/user instructions for CSV + image parsing.
func BuildExcelLLMPrompt(payload ExcelLLMPayload) (string, string) {
    sheetSummaries := make([]map[string]any, 0, len(payload.Sheets))
    for _, sheet := range payload.Sheets {
        sheetSummaries = append(sheetSummaries, map[string]any{
            "name":    sheet.Name,
            "rows":    sheet.TotalRows,
            "columns": sheet.TotalCols,
            "csv":     sheet.CSV,
        })
    }

    imageSummaries := make([]map[string]any, 0, len(payload.Images))
    for _, img := range payload.Images {
        imageSummaries = append(imageSummaries, map[string]any{
            "name":   img.Name,
            "sheet":  img.Sheet,
            "cell":   img.Cell,
            "row":    img.Row,
            "column": img.Column,
        })
    }

    context := map[string]any{
        "monthId":           payload.MonthID,
        "monthLabel":        util.MonthLabel(payload.MonthID),
        "userHint":          payload.UserHint,
        "allowedCategories": store.AllowedCategories(),
        "sheets":            sheetSummaries,
        "images":            imageSummaries,
    }
    ctxBytes, _ := json.Marshal(context)

    system := strings.Join([]string{
        "你是财务表格解析助手，请根据 CSV 文本与图片内容提取可入账的明细。",
        "这类 Excel 经常是报销单、支出登记、员工垫付、按人分 sheet 的报销汇总，sheet 名可能只是人名；只要行里能识别出实际收支项目和金额，就应提取为明细。",
        "只返回 JSON，格式为 {\"entries\":[...]}。每条明细字段：name, amount, type, category, note。",
        "type 只能是 income、expense、refund、adjustment。income/expense/adjustment 的 amount 用正数，refund 用负数。",
        "不要编造数据；不要重复提取合计行和明细行，若存在明细优先用明细。",
        "monthId 是入账月份，不是硬性过滤条件；即使行内日期显示为更早月份，只要整份资料显然是在为当前导入批次汇总报销或成本，也应保留这些 expense 明细。",
        "遇到表头如 日期、报销原因、付款金额、发票、付款图片 时，通常应提取为 expense；name 用报销原因，amount 用付款金额，category 归到最接近的成本类。",
        "成本分类尽量归到工资成本、佣金支付、投放费用、报销及杂项、办公固定成本、技术/录播费用等可读类别。",
        "如果无法识别到任何可入账明细，返回 {\"entries\":[]}。",
    }, "")

    user := strings.Join([]string{
        "以下是 Excel CSV 文本与截图信息，图片与 images 列表顺序一致。",
        "上下文：", string(ctxBytes),
    }, "\n")

    return system, user
}
