package server

import (
	"errors"
	"time"

	"financial-dashboard-backend/internal/store"
	"financial-dashboard-backend/internal/util"
)

// manualEntryFromPayload mirrors the legacy helper that turns a JSON payload
// into a normalized Entry record.
func manualEntryFromPayload(payload map[string]any) (*store.Entry, error) {
	entryType := util.CleanText(payload["type"])
	if !store.IsAllowedType(entryType) {
		return nil, errors.New("请选择正确的收支类型。")
	}
	name := util.CleanText(payload["name"])
	if name == "" {
		return nil, errors.New("请输入项目名称。")
	}
	amount, ok := util.ToNumber(payload["amount"])
	if !ok || amount <= 0 {
		return nil, errors.New("请输入大于 0 的金额。")
	}
	rawCategory := util.CleanText(payload["category"])
	category := ""
	switch entryType {
	case "expense":
		if rawCategory == "" {
			rawCategory = "未分类成本"
		}
		category = store.NormalizeCostCategory(rawCategory, name)
		amount = absFloat(amount)
	case "refund":
		category = "退款"
		amount = -absFloat(amount)
	case "adjustment":
		if rawCategory == "" {
			rawCategory = "调整"
		}
		category = rawCategory
		amount = absFloat(amount)
	default:
		if rawCategory == "" {
			rawCategory = "营收"
		}
		category = store.NormalizeIncomeCategory(rawCategory, name)
		amount = absFloat(amount)
	}
	return &store.Entry{
		ID:         "manual-" + time.Now().Format("20060102150405"),
		Name:       name,
		Amount:     util.RoundMoney(amount),
		Type:       entryType,
		Category:   category,
		SourceKind: "manual",
		Note:       util.CleanText(payload["note"]),
	}, nil
}

// correctEntry produces an updated Entry by merging payload changes onto the
// existing entry, mirroring the legacy server's logic.
func correctEntry(existing *store.Entry, payload map[string]any) (*store.Entry, error) {
	entryType := util.CleanText(payload["type"])
	if !store.IsAllowedType(entryType) {
		return nil, errors.New("请选择正确的收支类型。")
	}
	name := util.CleanText(payload["name"])
	if name == "" {
		return nil, errors.New("请输入项目名称。")
	}
	amount, ok := util.ToNumber(payload["amount"])
	if !ok || amount <= 0 {
		return nil, errors.New("请输入大于 0 的金额。")
	}
	rawCategory := util.CleanText(payload["category"])
	category := ""
	switch entryType {
	case "expense":
		if rawCategory == "" {
			rawCategory = "未分类成本"
		}
		category = store.NormalizeCostCategory(rawCategory, name)
		amount = absFloat(amount)
	case "refund":
		category = "退款"
		amount = -absFloat(amount)
	case "adjustment":
		if rawCategory == "" {
			rawCategory = "调整"
		}
		category = rawCategory
		amount = absFloat(amount)
	default:
		if rawCategory == "" {
			rawCategory = "营收"
		}
		category = store.NormalizeIncomeCategory(rawCategory, name)
		amount = absFloat(amount)
	}
	clone := *existing
	clone.Name = name
	clone.Amount = util.RoundMoney(amount)
	clone.Type = entryType
	clone.Category = category
	clone.Note = util.CleanText(payload["note"])
	clone.CorrectedAt = util.FormatNow()
	return &clone, nil
}

// upsertManualEntry appends a manual entry to an existing month snapshot.
func upsertManualEntry(existing *store.MonthData, monthID string, entry *store.Entry) *store.MonthData {
	var entries []*store.Entry
	if existing != nil {
		entries = append(entries, existing.Entries...)
	}
	entries = append(entries, entry)
	source := "手动录入"
	if existing != nil && existing.SourceFile != "" {
		source = existing.SourceFile
	}
	return store.MonthDataWithEntries(existing, monthID, entries, source)
}

// timeYearNow exposes the current year for chat-edit helpers without forcing
// the time package on each caller.
func timeYearNow() int { return time.Now().Year() }
