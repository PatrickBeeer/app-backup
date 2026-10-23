package store

import (
	"strings"

	"financial-dashboard-backend/internal/util"
)

// AllowedCategories mirrors the legacy Python list. Used by AI prompts.
func AllowedCategories() []string {
	return []string{
		"线下课营收",
		"课程营收",
		"企业培训",
		"工资成本",
		"社保成本",
		"佣金支付",
		"投放费用",
		"报销及杂项",
		"办公固定成本",
		"技术/录播费用",
		"退款",
		"调整",
		"未分类成本",
	}
}

// NormalizeEntryType decides between income/refund/adjustment based on the raw
// category text and the signed amount.
func NormalizeEntryType(rawCategory string, amount float64) string {
	if strings.Contains(rawCategory, "退款") || amount < 0 {
		return "refund"
	}
	if strings.Contains(rawCategory, "调整") {
		return "adjustment"
	}
	return "income"
}

// NormalizeIncomeCategory maps free-form category/name pairs to a curated
// income category. Mirrors the legacy heuristics.
func NormalizeIncomeCategory(rawCategory, name string) string {
	text := rawCategory + " " + name
	if strings.Contains(text, "培训") || strings.Contains(text, "企业") {
		return "企业培训"
	}
	if strings.Contains(text, "退款") {
		return "退款"
	}
	if strings.Contains(text, "调整") {
		return "调整"
	}
	if rawCategory != "" && rawCategory != "营收" {
		return rawCategory
	}
	return "课程营收"
}

// NormalizeCostCategory selects a standard cost category based on keyword
// matching against the cost description.
func NormalizeCostCategory(rawCategory, name string) string {
	text := rawCategory + " " + name
	rules := []struct {
		category string
		keywords []string
	}{
		{"工资成本", []string{"工资", "薪资", "薪酬"}},
		{"社保成本", []string{"社保", "公积金"}},
		{"佣金支付", []string{"佣金", "分佣"}},
		{"投放费用", []string{"投放", "千川", "广告", "视频号"}},
		{"报销及杂项", []string{"报销", "杂项", "差旅", "餐", "办公用品"}},
		{"办公固定成本", []string{"房租", "网", "电", "手机", "物业"}},
		{"技术/录播费用", []string{"录播", "技术", "软件", "系统"}},
	}
	for _, rule := range rules {
		for _, keyword := range rule.keywords {
			if strings.Contains(text, keyword) {
				return rule.category
			}
		}
	}
	if rawCategory == "" {
		return "未分类成本"
	}
	return rawCategory
}

// EntryAllowedTypes returns the four legal entry types.
func EntryAllowedTypes() []string {
	return []string{"income", "expense", "refund", "adjustment"}
}

// IsAllowedType reports whether the provided type is one of the four legal
// entry types.
func IsAllowedType(t string) bool {
	for _, v := range EntryAllowedTypes() {
		if v == t {
			return true
		}
	}
	return false
}

// HintMode mirrors the Python hint_mode helper used to decide which
// interpretation to apply when the file is ambiguous.
func HintMode(parseHint string) string {
	for _, w := range []string{"退款", "退费"} {
		if strings.Contains(parseHint, w) {
			return "refund"
		}
	}
	for _, w := range []string{"收入", "营收", "成交", "付款", "销售"} {
		if strings.Contains(parseHint, w) {
			return "income"
		}
	}
	for _, w := range []string{"工资", "成本", "支出", "费用", "报销"} {
		if strings.Contains(parseHint, w) {
			return "expense"
		}
	}
	return ""
}

// HintCategory chooses a sensible default category based on a hint string.
func HintCategory(parseHint, mode string) string {
	if strings.Contains(parseHint, "工资") {
		return "工资成本"
	}
	if strings.Contains(parseHint, "佣金") {
		return "佣金支付"
	}
	if strings.Contains(parseHint, "投放") {
		return "投放费用"
	}
	if strings.Contains(parseHint, "报销") || strings.Contains(parseHint, "杂项") {
		return "报销及杂项"
	}
	if strings.Contains(parseHint, "成交") || strings.Contains(parseHint, "学员") || strings.Contains(parseHint, "线下课") {
		return "线下课营收"
	}
	if mode == "income" {
		return "收入"
	}
	return "费用"
}

// MergeNote merges a note into the existing list, deduplicating by title and
// putting the new note first.
func MergeNote(notes []map[string]any, next map[string]any) []map[string]any {
	if next == nil {
		return notes
	}
	title := util.CleanText(next["title"])
	out := make([]map[string]any, 0, len(notes)+1)
	out = append(out, next)
	for _, note := range notes {
		if util.CleanText(note["title"]) == title {
			continue
		}
		out = append(out, note)
	}
	return out
}
