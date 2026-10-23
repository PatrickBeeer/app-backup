package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"financial-dashboard-backend/internal/util"
)

// Entry models a single ledger entry. Mirrors the JSON shape produced by the
// legacy Python server, so existing month files load and save losslessly.
type Entry struct {
	Name        string  `json:"name"`
	Amount      float64 `json:"amount"`
	Type        string  `json:"type"`
	Category    string  `json:"category"`
	SourceKind  string  `json:"sourceKind,omitempty"`
	SourceRef   string  `json:"sourceRef,omitempty"`
	Note        string  `json:"note,omitempty"`
	ID          string  `json:"id,omitempty"`
	CorrectedAt string  `json:"correctedAt,omitempty"`
	// Extra fields preserved verbatim across read/modify/write cycles.
	Extra map[string]any `json:"-"`
}

// MarshalJSON merges Extra fields back into the canonical key set so legacy
// callers do not lose anything they previously stored on an entry.
func (e *Entry) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, len(e.Extra)+8)
	for k, v := range e.Extra {
		out[k] = v
	}
	out["name"] = e.Name
	out["amount"] = e.Amount
	out["type"] = e.Type
	out["category"] = e.Category
	if e.SourceKind != "" {
		out["sourceKind"] = e.SourceKind
	}
	if e.SourceRef != "" {
		out["sourceRef"] = e.SourceRef
	}
	if e.Note != "" {
		out["note"] = e.Note
	} else if _, ok := e.Extra["note"]; !ok {
		// Always emit note when present to keep payload deterministic for the
		// front-end, mirroring the Python implementation.
		out["note"] = ""
	}
	if e.ID != "" {
		out["id"] = e.ID
	}
	if e.CorrectedAt != "" {
		out["correctedAt"] = e.CorrectedAt
	}
	return json.Marshal(out)
}

// UnmarshalJSON keeps unknown keys on Extra so they survive round-trips.
func (e *Entry) UnmarshalJSON(data []byte) error {
	raw := map[string]any{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	e.Name = util.CleanText(raw["name"])
	e.Type = util.CleanText(raw["type"])
	e.Category = util.CleanText(raw["category"])
	e.SourceKind = util.CleanText(raw["sourceKind"])
	e.SourceRef = util.CleanText(raw["sourceRef"])
	e.Note = util.CleanText(raw["note"])
	e.ID = util.CleanText(raw["id"])
	e.CorrectedAt = util.CleanText(raw["correctedAt"])
	if v, ok := util.ToNumber(raw["amount"]); ok {
		e.Amount = v
	}
	delete(raw, "name")
	delete(raw, "amount")
	delete(raw, "type")
	delete(raw, "category")
	delete(raw, "sourceKind")
	delete(raw, "sourceRef")
	delete(raw, "note")
	delete(raw, "id")
	delete(raw, "correctedAt")
	if len(raw) > 0 {
		e.Extra = raw
	}
	return nil
}

// MonthData captures the structure of a single month JSON file. Unknown fields
// stay on Extra so we can round-trip without losing data.
type MonthData struct {
	ID          string           `json:"id"`
	Label       string           `json:"label"`
	SourceFile  string           `json:"sourceFile"`
	UpdatedAt   string           `json:"updatedAt"`
	Title       string           `json:"title"`
	Summary     map[string]any   `json:"summary"`
	Entries     []*Entry         `json:"entries"`
	Attachments []map[string]any `json:"attachments"`
	Notes       []map[string]any `json:"notes"`
	Actions     []map[string]any `json:"actions"`
	Extra       map[string]any   `json:"-"`
}

// MarshalJSON ensures the file format is byte-for-byte compatible with the
// legacy Python backend (same field order, same omissions).
func (m *MonthData) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, 12)
	for k, v := range m.Extra {
		out[k] = v
	}
	out["id"] = m.ID
	out["label"] = m.Label
	out["sourceFile"] = m.SourceFile
	out["updatedAt"] = m.UpdatedAt
	out["title"] = m.Title
	out["summary"] = m.Summary
	if m.Entries == nil {
		out["entries"] = []any{}
	} else {
		out["entries"] = m.Entries
	}
	if m.Attachments == nil {
		out["attachments"] = []any{}
	} else {
		out["attachments"] = m.Attachments
	}
	if m.Notes == nil {
		out["notes"] = []any{}
	} else {
		out["notes"] = m.Notes
	}
	if m.Actions == nil {
		out["actions"] = []any{}
	} else {
		out["actions"] = m.Actions
	}
	return json.Marshal(out)
}

// UnmarshalJSON populates well-known fields and stashes the rest on Extra.
func (m *MonthData) UnmarshalJSON(data []byte) error {
	raw := map[string]any{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	m.ID = util.CleanText(raw["id"])
	m.Label = util.CleanText(raw["label"])
	m.SourceFile = util.CleanText(raw["sourceFile"])
	m.UpdatedAt = util.CleanText(raw["updatedAt"])
	m.Title = util.CleanText(raw["title"])
	if summary, ok := raw["summary"].(map[string]any); ok {
		m.Summary = summary
	}
	if attachments, ok := raw["attachments"].([]any); ok {
		m.Attachments = toMapSlice(attachments)
	}
	if notes, ok := raw["notes"].([]any); ok {
		m.Notes = toMapSlice(notes)
	}
	if actions, ok := raw["actions"].([]any); ok {
		m.Actions = toMapSlice(actions)
	}
	if entriesRaw, ok := raw["entries"].([]any); ok {
		entries := make([]*Entry, 0, len(entriesRaw))
		for _, item := range entriesRaw {
			b, err := json.Marshal(item)
			if err != nil {
				continue
			}
			var entry Entry
			if err := json.Unmarshal(b, &entry); err != nil {
				continue
			}
			entries = append(entries, &entry)
		}
		m.Entries = entries
	}
	delete(raw, "id")
	delete(raw, "label")
	delete(raw, "sourceFile")
	delete(raw, "updatedAt")
	delete(raw, "title")
	delete(raw, "summary")
	delete(raw, "entries")
	delete(raw, "attachments")
	delete(raw, "notes")
	delete(raw, "actions")
	if len(raw) > 0 {
		m.Extra = raw
	}
	return nil
}

func toMapSlice(items []any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// Manifest stores the list of month JSON paths.
type Manifest struct {
	Months []string `json:"months"`
}

// Store is the local-filesystem persistence layer for the dashboard. It is
// safe for concurrent use across the HTTP handlers.
type Store struct {
	root         string
	dataDir      string
	monthsDir    string
	uploadsDir   string
	manifestPath string
	embeddedPath string
	mu           sync.Mutex
}

// Options configures the Store layout.
type Options struct {
	// Root is the application root used for relative path computations.
	Root string
	// DataDir is the directory that holds manifest.json + months/. The
	// frontend fetches data via relative URLs from index.html, so this should
	// usually live alongside the served index.html (e.g. <root>/dist/data).
	DataDir string
	// UploadsDir is the directory for raw uploaded files.
	UploadsDir string
}

// New creates a Store rooted at appRoot using sensible default paths.
func New(appRoot string) (*Store, error) {
	return NewWith(Options{Root: appRoot})
}

// NewWith creates a Store with explicit directory overrides. Empty options
// fall back to <root>/data and <root>/uploads.
func NewWith(opts Options) (*Store, error) {
	if opts.Root == "" {
		return nil, fmt.Errorf("Root is required")
	}
	dataDir := opts.DataDir
	if dataDir == "" {
		dataDir = filepath.Join(opts.Root, "data")
	}
	uploadsDir := opts.UploadsDir
	if uploadsDir == "" {
		uploadsDir = filepath.Join(opts.Root, "uploads")
	}
	monthsDir := filepath.Join(dataDir, "months")

	for _, dir := range []string{dataDir, monthsDir, uploadsDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create %s: %w", dir, err)
		}
	}
	return &Store{
		root:         opts.Root,
		dataDir:      dataDir,
		monthsDir:    monthsDir,
		uploadsDir:   uploadsDir,
		manifestPath: filepath.Join(dataDir, "manifest.json"),
		embeddedPath: filepath.Join(dataDir, "embedded-data.js"),
	}, nil
}

// Root returns the application root.
func (s *Store) Root() string { return s.root }

// UploadsDir returns the absolute path of the uploads directory.
func (s *Store) UploadsDir() string { return s.uploadsDir }

// MonthsDir returns the absolute path of the months directory.
func (s *Store) MonthsDir() string { return s.monthsDir }

// LoadMonth returns the month data for the given id, or nil if it does not
// exist yet.
func (s *Store) LoadMonth(monthID string) (*MonthData, error) {
	path := filepath.Join(s.monthsDir, monthID+".json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var data MonthData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

// SaveMonth writes the month data and refreshes manifest/embedded data.
func (s *Store) SaveMonth(monthID string, data *MonthData) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.monthsDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	target := filepath.Join(s.monthsDir, monthID+".json")
	if err := os.WriteFile(target, body, 0o644); err != nil {
		return err
	}
	if err := s.updateManifestLocked("data/months/" + monthID + ".json"); err != nil {
		return err
	}
	return nil
}

// LoadManifest returns the manifest list (creating an empty one if missing).
func (s *Store) LoadManifest() (*Manifest, error) {
	raw, err := os.ReadFile(s.manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &Manifest{Months: []string{}}, nil
		}
		return nil, err
	}
	var manifest Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// updateManifestLocked merges the provided month path into the manifest and
// rewrites the embedded data javascript file.
func (s *Store) updateManifestLocked(monthPath string) error {
	manifest, err := s.LoadManifest()
	if err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, m := range manifest.Months {
		seen[m] = struct{}{}
	}
	seen[monthPath] = struct{}{}
	months := make([]string, 0, len(seen))
	for m := range seen {
		months = append(months, m)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(months)))
	manifest.Months = months

	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.manifestPath, body, 0o644); err != nil {
		return err
	}
	return s.writeEmbeddedLocked(manifest)
}

// SyncEmbeddedData regenerates embedded-data.js based on the on-disk manifest.
// Useful at boot to make the embedded fallback consistent with the data dir.
func (s *Store) SyncEmbeddedData() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	manifest, err := s.LoadManifest()
	if err != nil {
		return err
	}
	return s.writeEmbeddedLocked(manifest)
}

func (s *Store) writeEmbeddedLocked(manifest *Manifest) error {
	loaded := []any{}
	for _, monthPath := range manifest.Months {
		// Manifest entries are paths relative to the served index.html, e.g.
		// "data/months/2026-05.json". Read them back from the actual data
		// directory regardless of where that lives on disk.
		base := filepath.Base(monthPath)
		full := filepath.Join(s.monthsDir, base)
		body, err := os.ReadFile(full)
		if err != nil {
			continue
		}
		var item any
		if err := json.Unmarshal(body, &item); err != nil {
			continue
		}
		loaded = append(loaded, item)
	}
	payload := map[string]any{
		"manifest": manifest,
		"months":   loaded,
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	escaped := strings.ReplaceAll(string(data), "<", `\u003c`)
	body := []byte("window.__FINANCE_DASHBOARD_DATA__ = " + escaped + ";\n")
	return os.WriteFile(s.embeddedPath, body, 0o644)
}

// EmptyMonth returns a fresh empty month skeleton mirroring the legacy server.
func EmptyMonth(monthID string) *MonthData {
	return &MonthData{
		ID:         monthID,
		Label:      util.MonthLabel(monthID),
		SourceFile: "手动录入",
		UpdatedAt:  util.FormatNow(),
		Title:      util.MonthLabel(monthID) + "财务报表",
		Summary:    SummarizeEntries(nil),
		Entries:    []*Entry{},
		Attachments: []map[string]any{},
		Notes:       []map[string]any{},
		Actions:    DefaultActions(),
	}
}

// SummarizeEntries computes the dashboard summary based on the entries.
func SummarizeEntries(entries []*Entry) map[string]any {
	var gross, refunds, adjustments, expenses float64
	for _, e := range entries {
		switch e.Type {
		case "income":
			gross += e.Amount
		case "refund":
			refunds += e.Amount
		case "adjustment":
			adjustments += e.Amount
		case "expense":
			expenses += e.Amount
		}
	}
	netRevenue := gross + refunds + adjustments
	bookProfit := gross - expenses
	netProfit := netRevenue - expenses
	rate := 0.0
	if netRevenue != 0 {
		rate = netProfit / netRevenue
	}
	return map[string]any{
		"grossRevenue":  util.RoundMoney(gross),
		"refunds":       util.RoundMoney(refunds),
		"netRevenue":    util.RoundMoney(netRevenue),
		"expenses":      util.RoundMoney(expenses),
		"bookProfit":    util.RoundMoney(bookProfit),
		"netProfit":     util.RoundMoney(netProfit),
		"netProfitRate": rate,
	}
}

// DefaultActions reproduces the legacy default actions block.
func DefaultActions() []map[string]any {
	return []map[string]any{
		{"title": "检查成本分类", "text": "导入或录入后优先查看工资、人力、佣金、投放和杂项是否归类准确。"},
		{"title": "复盘利润率", "text": "每月比较净营收、总支出和实际净利润率的变化。"},
		{"title": "保留原始凭证", "text": "上传文件和手动录入会保存在本地数据中，方便日后追溯。"},
	}
}

// BuildNotes mirrors the helpful informational notes attached to each month.
func BuildNotes(entries []*Entry) []map[string]any {
	categories := map[string]struct{}{}
	hasManual := false
	hasAI := false
	for _, e := range entries {
		if e.Type == "expense" && e.Category != "" {
			categories[e.Category] = struct{}{}
		}
		if e.SourceKind == "manual" {
			hasManual = true
		}
		if strings.HasPrefix(e.SourceKind, "ai") {
			hasAI = true
		}
	}
	keys := make([]string, 0, len(categories))
	for k := range categories {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	source := "本月数据由上传表格自动解析生成。"
	if hasManual {
		source = "本月数据由上传表格解析和手动录入共同生成。"
	}
	costsText := "暂无成本分类。"
	if len(keys) > 0 {
		costsText = "已识别：" + strings.Join(keys, "、")
	}
	notes := []map[string]any{
		{"title": "数据来源", "text": source},
		{"title": "成本分类", "text": costsText},
		{"title": "口径提示", "text": "净营收 = 收入 + 退款/调整；实际净利润 = 净营收 - 总支出。"},
	}
	if hasAI {
		notes = append(notes[:1], append([]map[string]any{{"title": "AI辅助识别", "text": "本月使用大模型进行了辅助解析，请重点核对金额、月份和分类。"}}, notes[1:]...)...)
	}
	return notes
}

// MonthDataWithEntries clones existing month data, applies the new entries and
// recalculates derived fields. Mirrors the Python helper of the same name.
func MonthDataWithEntries(existing *MonthData, monthID string, entries []*Entry, sourceFile string) *MonthData {
	var data *MonthData
	if existing != nil {
		clone := *existing
		clone.Extra = copyMap(existing.Extra)
		clone.Summary = copyMap(existing.Summary)
		clone.Attachments = append([]map[string]any{}, existing.Attachments...)
		data = &clone
	} else {
		data = EmptyMonth(monthID)
	}
	if data.Extra != nil {
		delete(data.Extra, "isEmpty")
	}
	data.ID = monthID
	data.Label = util.MonthLabel(monthID)
	if data.Title == "" {
		data.Title = util.MonthLabel(monthID) + "财务报表"
	}
	if sourceFile != "" {
		data.SourceFile = sourceFile
	} else if data.SourceFile == "" {
		data.SourceFile = "手动录入"
	}
	data.UpdatedAt = util.FormatNow()
	data.Summary = SummarizeEntries(entries)
	data.Entries = entries
	if data.Attachments == nil {
		data.Attachments = []map[string]any{}
	}
	data.Notes = BuildNotes(entries)
	if len(data.Actions) == 0 {
		data.Actions = DefaultActions()
	}
	return data
}

func copyMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// UpsertAIEntries appends AI-derived entries while replacing previous entries
// that share the same source ref. Mirrors the legacy upsert behavior.
func UpsertAIEntries(existing *MonthData, monthID string, next []*Entry, sourceLabel string) *MonthData {
	var existingEntries []*Entry
	if existing != nil {
		existingEntries = append([]*Entry{}, existing.Entries...)
	}
	type refKey struct {
		sourceKind string
		sourceRef  string
	}
	nextRefs := map[refKey]struct{}{}
	for _, e := range next {
		if strings.TrimSpace(e.SourceRef) == "" {
			continue
		}
		nextRefs[refKey{e.SourceKind, e.SourceRef}] = struct{}{}
	}
	kept := existingEntries
	if len(nextRefs) > 0 {
		kept = make([]*Entry, 0, len(existingEntries))
		for _, e := range existingEntries {
			key := refKey{e.SourceKind, e.SourceRef}
			if _, drop := nextRefs[key]; drop && e.SourceRef != "" {
				continue
			}
			kept = append(kept, e)
		}
	}
	merged := append(kept, next...)
	return MonthDataWithEntries(existing, monthID, merged, sourceLabel)
}

// MergeExistingEntries combines newly parsed entries with previously known
// entries based on the parsedKind, mirroring the legacy strategy.
func MergeExistingEntries(existing *MonthData, entries []*Entry, parsedKind string) []*Entry {
	if existing == nil {
		return entries
	}
	existingEntries := existing.Entries
	var kept []*Entry
	switch parsedKind {
	case "detail":
		for _, e := range existingEntries {
			if e.SourceKind == "manual" {
				kept = append(kept, e)
			}
		}
	case "salary":
		for _, e := range existingEntries {
			if e.SourceKind == "salary" || (e.Category == "工资成本" && strings.HasSuffix(e.Name, "工资")) {
				continue
			}
			kept = append(kept, e)
		}
	case "enrollment":
		for _, e := range existingEntries {
			if e.SourceKind == "enrollment" || e.Category == "线下课营收" {
				continue
			}
			kept = append(kept, e)
		}
	case "ai":
		for _, e := range existingEntries {
			if e.SourceKind == "ai" {
				continue
			}
			kept = append(kept, e)
		}
	default:
		kept = existingEntries
	}
	return append(kept, entries...)
}

// UploadRelativePath renders a path inside the app root using forward slashes.
func (s *Store) UploadRelativePath(absPath string) string {
	rel, err := filepath.Rel(s.root, absPath)
	if err != nil {
		return absPath
	}
	return filepath.ToSlash(rel)
}
