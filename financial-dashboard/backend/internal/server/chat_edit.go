package server

import (
	"regexp"
	"strconv"
	"strings"

	"financial-dashboard-backend/internal/store"
	"financial-dashboard-backend/internal/util"
)

// applyChatEditActions applies the AI-derived actions to the entries list and
// returns the updated entries plus a count of changes.
func applyChatEditActions(entries []*store.Entry, actionsPayload map[string]any) ([]*store.Entry, int) {
	rawActions, ok := actionsPayload["actions"].([]any)
	if !ok {
		return entries, 0
	}
	next := make([]*store.Entry, len(entries))
	for i, e := range entries {
		clone := *e
		next[i] = &clone
	}
	changed := 0
	for _, item := range rawActions {
		action, ok := item.(map[string]any)
		if !ok {
			continue
		}
		switch util.CleanText(action["action"]) {
		case "rename_category":
			from := util.CleanText(action["fromCategory"])
			to := util.CleanText(action["toCategory"])
			if from == "" || to == "" {
				continue
			}
			for _, e := range next {
				if e.Category == from {
					e.Category = to
					e.CorrectedAt = util.FormatNow()
					changed++
				}
			}
		case "delete_entry":
			index, ok := util.ToInt(action["index"])
			if !ok || index < 1 || index > len(next) {
				continue
			}
			next = append(next[:index-1], next[index:]...)
			changed++
		case "delete_matching":
			filters := chatEditMatchFilters(action)
			if len(filters) == 0 {
				continue
			}
			kept := next[:0]
			for _, e := range next {
				if chatEditEntryMatches(e, filters) {
					changed++
					continue
				}
				kept = append(kept, e)
			}
			next = kept
		case "update_entry":
			index, ok := util.ToInt(action["index"])
			if !ok || index < 1 || index > len(next) {
				continue
			}
			payload := map[string]any{
				"type":     valueOr(action["type"], next[index-1].Type),
				"name":     valueOr(action["name"], next[index-1].Name),
				"category": valueOr(action["category"], next[index-1].Category),
				"amount":   valueOr(action["amount"], absFloat(next[index-1].Amount)),
				"note":     valueOr(action["note"], next[index-1].Note),
			}
			updated, err := correctEntry(next[index-1], payload)
			if err != nil {
				continue
			}
			next[index-1] = updated
			changed++
		}
	}
	return next, changed
}

func chatEditMatchFilters(action map[string]any) map[string]string {
	filters := map[string]string{}
	if v := util.CleanText(action["type"]); v != "" {
		filters["type"] = v
	}
	if v := util.CleanText(action["category"]); v != "" {
		filters["category"] = v
	}
	if v := util.CleanText(action["nameContains"]); v != "" {
		filters["nameContains"] = v
	}
	if v := util.CleanText(action["noteContains"]); v != "" {
		filters["noteContains"] = v
	}
	return filters
}

func chatEditEntryMatches(entry *store.Entry, filters map[string]string) bool {
	if v, ok := filters["type"]; ok && entry.Type != v {
		return false
	}
	if v, ok := filters["category"]; ok && entry.Category != v {
		return false
	}
	if v, ok := filters["nameContains"]; ok && !strings.Contains(entry.Name, v) {
		return false
	}
	if v, ok := filters["noteContains"]; ok && !strings.Contains(entry.Note, v) {
		return false
	}
	return true
}

// inferChatEditActions reproduces the rule-based fast path from the Python
// implementation: simple rename/delete commands do not require an AI call.
func inferChatEditActions(instruction string, monthData *store.MonthData) map[string]any {
	text := strings.TrimSpace(instruction)
	if text == "" {
		return map[string]any{"actions": []any{}}
	}
	if action := inferRenameAction(text, monthData); action != nil {
		return map[string]any{"actions": []any{action}}
	}
	hasDelete := false
	for _, w := range []string{"删除", "删掉", "移除"} {
		if strings.Contains(text, w) {
			hasDelete = true
			break
		}
	}
	hasBulk := false
	for _, w := range []string{"全部", "所有", "全部的", "所有的"} {
		if strings.Contains(text, w) {
			hasBulk = true
			break
		}
	}
	if !hasDelete || !hasBulk {
		return map[string]any{"actions": []any{}}
	}
	action := map[string]any{"action": "delete_matching"}
	switch {
	case strings.Contains(text, "收入") || strings.Contains(text, "营收"):
		action["type"] = "income"
	case strings.Contains(text, "支出") || strings.Contains(text, "成本") || strings.Contains(text, "费用"):
		action["type"] = "expense"
	case strings.Contains(text, "退款"):
		action["type"] = "refund"
	case strings.Contains(text, "调整"):
		action["type"] = "adjustment"
	}
	categories := categoriesByLength(monthData)
	for _, category := range categories {
		compact := strings.ReplaceAll(category, "营收", "收入")
		if strings.Contains(text, category) || strings.Contains(text, compact) {
			action["category"] = category
			break
		}
	}
	if _, ok := action["category"]; !ok {
		if strings.Contains(text, "线下课") {
			matched := ""
			for _, c := range categories {
				if strings.Contains(c, "线下课") {
					matched = c
					break
				}
			}
			if matched != "" {
				action["category"] = matched
			} else {
				action["nameContains"] = "线下课"
			}
		}
	}
	if _, ok := action["category"]; !ok {
		if strings.Contains(text, "课程") && (strings.Contains(text, "收入") || strings.Contains(text, "营收")) {
			for _, c := range categories {
				if strings.Contains(c, "课程") && (strings.Contains(c, "收入") || strings.Contains(c, "营收")) {
					action["category"] = c
					break
				}
			}
		}
	}
	if hasMatcher(action) {
		return map[string]any{"actions": []any{action}}
	}
	return map[string]any{"actions": []any{}}
}

func hasMatcher(action map[string]any) bool {
	for _, key := range []string{"type", "category", "nameContains", "noteContains"} {
		if _, ok := action[key]; ok {
			return true
		}
	}
	return false
}

func categoriesByLength(monthData *store.MonthData) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, e := range monthData.Entries {
		if e.Category == "" {
			continue
		}
		if _, ok := seen[e.Category]; ok {
			continue
		}
		seen[e.Category] = struct{}{}
		out = append(out, e.Category)
	}
	// Sort by length descending so we match the most specific category first.
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if len([]rune(out[j])) > len([]rune(out[i])) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

var (
	renamePattern1 = regexp.MustCompile(`把\s*(.+?)\s*(?:改成|改为|改名为|重命名为)\s*(.+)`)
	renamePattern2 = regexp.MustCompile(`将\s*(.+?)\s*(?:改成|改为|改名为|重命名为)\s*(.+)`)
)

func inferRenameAction(text string, monthData *store.MonthData) map[string]any {
	match := renamePattern1.FindStringSubmatch(text)
	if match == nil {
		match = renamePattern2.FindStringSubmatch(text)
	}
	if match == nil {
		return nil
	}
	from := cleanupRenameText(match[1])
	to := cleanupRenameText(match[2])
	if from == "" || to == "" || from == to {
		return nil
	}
	categories := categoriesByLength(monthData)
	for _, c := range categories {
		if from == c {
			return map[string]any{"action": "rename_category", "fromCategory": c, "toCategory": to}
		}
	}
	for _, c := range categories {
		if strings.Contains(from, c) || strings.Contains(c, from) {
			return map[string]any{"action": "rename_category", "fromCategory": c, "toCategory": to}
		}
	}
	matchIndex := -1
	matched := 0
	for index, e := range monthData.Entries {
		if e.Name == from {
			matched++
			matchIndex = index + 1
		}
	}
	if matched == 1 && matchIndex > 0 {
		entry := monthData.Entries[matchIndex-1]
		return map[string]any{
			"action":   "update_entry",
			"index":    matchIndex,
			"name":     to,
			"type":     entry.Type,
			"category": entry.Category,
			"amount":   absFloat(entry.Amount),
			"note":     entry.Note,
		}
	}
	return nil
}

var renamePrefix = regexp.MustCompile(`^(分类|名称|项目|明细|成本分类|收入分类|支出分类)`)
var renameSuffix = regexp.MustCompile(`(这个|这条|该|的)?(分类|名称|项目|明细)$`)
var renameSplit = regexp.MustCompile(`[，。；;,.]`)

func cleanupRenameText(text string) string {
	cleaned := strings.TrimSpace(text)
	cleaned = renamePrefix.ReplaceAllString(cleaned, "")
	cleaned = renameSuffix.ReplaceAllString(cleaned, "")
	parts := renameSplit.Split(cleaned, 2)
	if len(parts) > 0 {
		cleaned = parts[0]
	}
	cleaned = strings.Trim(cleaned, " 「」'\"")
	return cleaned
}

// monthIDFromInstruction tries to detect a month id embedded in the user
// instruction, falling back to the supplied default.
func monthIDFromInstruction(instruction, fallback string) string {
	text := strings.TrimSpace(instruction)
	year := strconv.Itoa(timeYearNow())
	if regexp.MustCompile(`^\d{4}-\d{2}$`).MatchString(fallback) {
		year = strings.SplitN(fallback, "-", 2)[0]
	}
	if match := regexp.MustCompile(`(20\d{2})[-/.年]\s*(0?[1-9]|1[0-2])\s*月?`).FindStringSubmatch(text); match != nil {
		m, _ := strconv.Atoi(match[2])
		return formatMonth(match[1], m)
	}
	if match := regexp.MustCompile(`(?:^|[^0-9])(0?[1-9]|1[0-2])\s*月份?`).FindStringSubmatch(text); match != nil {
		m, _ := strconv.Atoi(match[1])
		return formatMonth(year, m)
	}
	chinese := []struct {
		label string
		month int
	}{
		{"十二", 12}, {"十一", 11}, {"十", 10},
		{"九", 9}, {"八", 8}, {"七", 7}, {"六", 6},
		{"五", 5}, {"四", 4}, {"三", 3}, {"二", 2}, {"一", 1},
	}
	for _, c := range chinese {
		if strings.Contains(text, c.label+"月份") || strings.Contains(text, c.label+"月") {
			return formatMonth(year, c.month)
		}
	}
	return fallback
}

func formatMonth(year string, month int) string {
	if month < 1 || month > 12 {
		return ""
	}
	return year + "-" + leftPad(strconv.Itoa(month), 2, '0')
}

func leftPad(s string, length int, pad rune) string {
	if len(s) >= length {
		return s
	}
	return strings.Repeat(string(pad), length-len(s)) + s
}

func valueOr(value, fallback any) any {
	if value == nil {
		return fallback
	}
	if s, ok := value.(string); ok && strings.TrimSpace(s) == "" {
		return fallback
	}
	return value
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
