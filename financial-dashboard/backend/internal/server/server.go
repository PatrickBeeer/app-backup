package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"financial-dashboard-backend/internal/aiclient"
	"financial-dashboard-backend/internal/excelparser"
	"financial-dashboard-backend/internal/parser"
	"financial-dashboard-backend/internal/store"
	"financial-dashboard-backend/internal/util"
)

const (
	maxImportSize = 64 << 20 // 64 MB
)

var (
	excelExtensions = map[string]struct{}{".xlsx": {}, ".xlsm": {}}
	imageExtensions = map[string]struct{}{".png": {}, ".jpg": {}, ".jpeg": {}, ".webp": {}}
)

// Server wires HTTP handlers, persistence and AI calls together.
type Server struct {
	root      string
	staticDir string
	store     *store.Store
	ai        *aiclient.Client
	excelParser *excelparser.Client
	logger    *log.Logger
}

// New creates a Server rooted at appRoot.
func New(appRoot string, st *store.Store, ai *aiclient.Client, excelParser *excelparser.Client, logger *log.Logger) *Server {
	staticDir := ChooseStaticDir(appRoot)
	if logger == nil {
		logger = log.Default()
	}
	if ai == nil {
		ai = aiclient.New()
	}
	if excelParser == nil {
		excelParser = excelparser.New()
	}
	return &Server{
		root:      appRoot,
		staticDir: staticDir,
		store:     st,
		ai:        ai,
		excelParser: excelParser,
		logger:    logger,
	}
}

// ChooseStaticDir prefers <root>/dist when present (built front-end) but falls
// back to the project root so dev builds work too.
func ChooseStaticDir(appRoot string) string {
	dist := filepath.Join(appRoot, "dist")
	if info, err := os.Stat(dist); err == nil && info.IsDir() {
		if _, err := os.Stat(filepath.Join(dist, "index.html")); err == nil {
			return dist
		}
	}
	return appRoot
}

// Handler returns the http.Handler for the dashboard.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/import", s.apiHandler(http.MethodPost, s.handleImport))
	mux.HandleFunc("/api/smart-entry", s.apiHandler(http.MethodPost, s.handleSmartEntry))
	mux.HandleFunc("/api/manual-entry", s.apiHandler(http.MethodPost, s.handleManualEntry))
	mux.HandleFunc("/api/update-entry", s.apiHandler(http.MethodPost, s.handleUpdateEntry))
	mux.HandleFunc("/api/delete-entry", s.apiHandler(http.MethodPost, s.handleDeleteEntry))
	mux.HandleFunc("/api/rename-category", s.apiHandler(http.MethodPost, s.handleRenameCategory))
	mux.HandleFunc("/api/chat-edit", s.apiHandler(http.MethodPost, s.handleChatEdit))
	mux.HandleFunc("/", s.handleStatic)
	return s.withCommonHeaders(mux)
}

// apiHandler handles CORS preflight and method gating for JSON endpoints.
// The dashboard's index.html is sometimes served by a different origin
// (e.g. the standalone-app wrapper running on app-manager port 3002), so
// the Go backend must respond to cross-origin fetches.
func (s *Server) apiHandler(method string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.applyCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != method {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handler(w, r)
	}
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	requestedHeaders := r.Header.Get("Access-Control-Request-Headers")
	if requestedHeaders == "" {
		requestedHeaders = "Content-Type"
	}
	w.Header().Set("Access-Control-Allow-Headers", requestedHeaders)
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Max-Age", "600")
}


func (s *Server) withCommonHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	s.applyCORS(w, r)
	if s.staticDir == "" {
		http.NotFound(w, r)
		return
	}
	urlPath := r.URL.Path
	if urlPath == "/" {
		urlPath = "/index.html"
	}
	clean := path.Clean("/" + strings.TrimPrefix(urlPath, "/"))
	if strings.Contains(clean, "..") {
		http.NotFound(w, r)
		return
	}
	target := filepath.Join(s.staticDir, filepath.FromSlash(clean))
	info, err := os.Stat(target)
	if err == nil && info.IsDir() {
		target = filepath.Join(target, "index.html")
		info, err = os.Stat(target)
	}
	if err != nil {
		// data/ and uploads/ live under appRoot rather than staticDir; try
		// loading them from the actual app root if the static dir was dist.
		if s.staticDir != s.root {
			altTarget := filepath.Join(s.root, filepath.FromSlash(clean))
			if alt, altErr := os.Stat(altTarget); altErr == nil {
				target = altTarget
				info = alt
				err = nil
			}
		}
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if info.IsDir() {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, target)
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		s.logger.Printf("write json: %v", err)
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, message string) {
	s.writeJSON(w, status, map[string]any{"ok": false, "error": message})
}

// ===== /api/import =====

func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxImportSize); err != nil {
		s.writeError(w, http.StatusBadRequest, "无法解析上传内容："+err.Error())
		return
	}
	monthID := strings.TrimSpace(r.FormValue("month"))
	parseHint := strings.TrimSpace(r.FormValue("hint"))
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "没有收到资料文件。")
		return
	}
	defer file.Close()

	if header.Filename == "" {
		s.writeError(w, http.StatusBadRequest, "没有收到资料文件。")
		return
	}
	original := util.SanitizeFilename(header.Filename)
	uploadPath := filepath.Join(s.store.UploadsDir(), monthID+"_"+original)
	if err := os.MkdirAll(filepath.Dir(uploadPath), 0o755); err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法创建上传目录："+err.Error())
		return
	}
	out, err := os.Create(uploadPath)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法保存上传文件："+err.Error())
		return
	}
	if _, err := io.Copy(out, file); err != nil {
		out.Close()
		s.writeError(w, http.StatusInternalServerError, "无法保存上传文件："+err.Error())
		return
	}
	out.Close()

	ext := strings.ToLower(filepath.Ext(uploadPath))
	switch {
	case isExcel(ext):
		s.importExcel(r.Context(), w, monthID, uploadPath, parseHint)
	case isImage(ext):
		s.importImage(w, monthID, uploadPath, parseHint)
	default:
		s.writeError(w, http.StatusBadRequest, "暂不支持该文件格式。请上传 .xlsx、.xlsm、.png、.jpg、.jpeg 或 .webp。")
	}
}

func isExcel(ext string) bool {
	_, ok := excelExtensions[ext]
	return ok
}

func isImage(ext string) bool {
	_, ok := imageExtensions[ext]
	return ok
}

func (s *Server) importExcel(ctx context.Context, w http.ResponseWriter, monthID, uploadPath, parseHint string) {
	if s.excelParser == nil {
		s.excelParser = excelparser.New()
	}
	config := loadExcelImportConfig()
	requestMaxImages := 0
	if config.ImageTotalLimit > 0 {
		requestMaxImages = config.ImageTotalLimit + 1
	}

	parsed, err := s.excelParser.Parse(ctx, uploadPath, config.MaxSheetRows, requestMaxImages)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "Excel 解析失败："+err.Error())
		return
	}
	if config.ImageTotalLimit > 0 && len(parsed.Images) > config.ImageTotalLimit {
		s.writeError(w, http.StatusBadRequest, fmt.Sprintf("Excel 图片数量超过限制（最多 %d 张），请删除部分截图后重试。", config.ImageTotalLimit))
		return
	}

	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}

	entries, err := s.llmExcelEntries(ctx, parsed, monthID, parseHint, config.ImageBatchLimit)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "AI 识别失败："+err.Error())
		return
	}
	if len(entries) == 0 {
		profile := buildExcelProfile(parsed, parseHint)
		s.writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"ok":                 false,
			"needsClarification": true,
			"error":              "没有自动识别到可入账明细。",
			"profile":            profile,
		})
		return
	}

	sourceRef := s.store.UploadRelativePath(uploadPath)
	for _, entry := range entries {
		entry.SourceKind = "ai"
		entry.SourceRef = sourceRef
	}
	merged := store.MergeExistingEntries(existing, entries, "ai")

	monthData := store.MonthDataWithEntries(existing, monthID, merged, uploadPath)
	monthData.Title = excelTitleFromSheets(parsed, monthID)

	attachment := map[string]any{
		"type": "spreadsheet",
		"name": filepath.Base(uploadPath),
		"path": s.store.UploadRelativePath(uploadPath),
		"kind": "Excel表格",
	}
	monthData.Attachments = upsertAttachment(monthData.Attachments, attachment)

	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"monthId":         monthID,
		"label":           monthData.Label,
		"entryCount":      len(monthData.Entries),
		"attachmentCount": len(monthData.Attachments),
		"dataPath":        "data/months/" + monthID + ".json",
	})
}

func (s *Server) importImage(w http.ResponseWriter, monthID, uploadPath, parseHint string) {
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	attachment := map[string]any{
		"type": "image",
		"name": filepath.Base(uploadPath),
		"path": s.store.UploadRelativePath(uploadPath),
		"kind": "图片/截图凭证",
	}

	var aiErr error
	var aiEntries []*store.Entry
	if s.ai.HasAnyKey() {
		entries, err := parser.AIImageEntries(s.ai, uploadPath, monthID, parseHint)
		if err != nil {
			aiErr = err
		} else {
			aiEntries = entries
		}
	}

	if len(aiEntries) > 0 {
		sourceRef := s.store.UploadRelativePath(uploadPath)
		for _, e := range aiEntries {
			e.SourceKind = "ai-image"
			e.SourceRef = sourceRef
		}
		monthData := store.UpsertAIEntries(existing, monthID, aiEntries, "截图识别")
		monthData.SourceFile = uploadPath
		monthData.Attachments = upsertAttachment(monthData.Attachments, attachment)
		monthData.Notes = store.MergeNote(monthData.Notes, map[string]any{
			"title": "截图识别",
			"text":  "已从 " + filepath.Base(uploadPath) + " 自动识别 " + fmt.Sprintf("%d", len(aiEntries)) + " 条明细，请核对金额和分类。",
		})
		if err := s.store.SaveMonth(monthID, monthData); err != nil {
			s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{
			"ok":              true,
			"monthId":         monthID,
			"label":           monthData.Label,
			"entryCount":      len(monthData.Entries),
			"attachmentCount": len(monthData.Attachments),
			"dataPath":        "data/months/" + monthID + ".json",
			"message":         monthData.Label + " 已从截图识别并导入 " + fmt.Sprintf("%d", len(aiEntries)) + " 条明细。",
		})
		return
	}

	// No entries; still record the attachment and informational notes.
	noteText := "已上传图片/截图作为原始凭证；AI没有识别到可入账明细。"
	importMessage := util.MonthLabel(monthID) + " 已保存截图；AI没有识别到可入账明细。"
	if aiErr != nil {
		noteText = "已上传图片/截图作为原始凭证；AI识别失败：" + aiErr.Error()
		importMessage = util.MonthLabel(monthID) + " 已保存截图，但 AI 识别失败，请查看口径说明。"
	} else if !s.ai.HasAnyKey() {
		noteText = "已上传图片/截图作为原始凭证；配置 OPENAI_API_KEY 或 GEMINI_API_KEY 后可自动识别入账。"
		importMessage = util.MonthLabel(monthID) + " 已保存截图；配置模型密钥后可自动识别入账。"
	}

	if existing != nil {
		existing.SourceFile = uploadPath
		existing.UpdatedAt = util.FormatNow()
		existing.Attachments = upsertAttachment(existing.Attachments, attachment)
		existing.Notes = store.MergeNote(existing.Notes, map[string]any{"title": "图片凭证", "text": noteText})
		if err := s.store.SaveMonth(monthID, existing); err != nil {
			s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{
			"ok":              true,
			"monthId":         monthID,
			"label":           existing.Label,
			"entryCount":      len(existing.Entries),
			"attachmentCount": len(existing.Attachments),
			"dataPath":        "data/months/" + monthID + ".json",
			"message":         importMessage,
		})
		return
	}

	monthData := store.EmptyMonth(monthID)
	monthData.SourceFile = uploadPath
	monthData.Title = util.MonthLabel(monthID) + "财务资料"
	monthData.Attachments = upsertAttachment(monthData.Attachments, attachment)
	monthData.Notes = []map[string]any{
		{"title": "图片凭证", "text": noteText},
		{"title": "待核对", "text": "截图识别后请核对收入、支出、退款和成本分类。"},
	}
	monthData.Actions = []map[string]any{
		{"title": "补充说明", "text": "如截图结构复杂，上传时在识别说明里写明这是收入、支出、退款或工资表。"},
		{"title": "人工核对", "text": "图片凭证可用于核对原始截图和后续录入数据。"},
	}
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"monthId":         monthID,
		"label":           monthData.Label,
		"entryCount":      0,
		"attachmentCount": len(monthData.Attachments),
		"dataPath":        "data/months/" + monthID + ".json",
		"message":         importMessage,
	})
}

func upsertAttachment(items []map[string]any, attachment map[string]any) []map[string]any {
	target := util.CleanText(attachment["path"])
	out := make([]map[string]any, 0, len(items)+1)
	for _, item := range items {
		if util.CleanText(item["path"]) == target {
			continue
		}
		out = append(out, item)
	}
	out = append(out, attachment)
	return out
}

// ===== /api/smart-entry =====

func (s *Server) handleSmartEntry(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	monthID := util.CleanText(payload["month"])
	text := util.CleanText(payload["text"])
	hint := util.CleanText(payload["hint"])
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	if text == "" {
		s.writeError(w, http.StatusBadRequest, "请输入要识别入账的文字。")
		return
	}
	if !s.ai.HasAnyKey() {
		s.writeError(w, http.StatusBadRequest, "请先在 .env 中配置 OPENAI_API_KEY 或 GEMINI_API_KEY，才能使用 AI 文字录入。")
		return
	}

	entries, err := parser.AITextEntries(s.ai, text, monthID, hint)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(entries) == 0 {
		s.writeError(w, http.StatusBadRequest, "AI 没有识别到可入账明细，请补充金额、项目或类型。")
		return
	}
	sourceRef := util.TextSourceRef(monthID, text)
	for _, e := range entries {
		e.SourceKind = "ai-text"
		e.SourceRef = sourceRef
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	monthData := store.UpsertAIEntries(existing, monthID, entries, "AI文字录入")
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"monthId":    monthID,
		"label":      monthData.Label,
		"entryCount": len(entries),
		"dataPath":   "data/months/" + monthID + ".json",
		"message":    fmt.Sprintf("%s 已从文字识别并导入 %d 条明细。", monthData.Label, len(entries)),
	})
}

// ===== /api/manual-entry =====

func (s *Server) handleManualEntry(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	monthID := util.CleanText(payload["month"])
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	entry, err := manualEntryFromPayload(payload)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	monthData := upsertManualEntry(existing, monthID, entry)
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"monthId":    monthID,
		"label":      monthData.Label,
		"entryCount": len(monthData.Entries),
		"dataPath":   "data/months/" + monthID + ".json",
	})
}

// ===== /api/update-entry =====

func (s *Server) handleUpdateEntry(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	monthID := util.CleanText(payload["month"])
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	if existing == nil {
		s.writeError(w, http.StatusBadRequest, "该月份还没有可修改的数据。")
		return
	}
	index, ok := util.ToInt(payload["index"])
	if !ok || index < 0 || index >= len(existing.Entries) {
		s.writeError(w, http.StatusBadRequest, "没有找到要修改的明细。")
		return
	}
	updated, err := correctEntry(existing.Entries[index], payload)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	entries := append([]*store.Entry{}, existing.Entries...)
	entries[index] = updated
	monthData := store.MonthDataWithEntries(existing, monthID, entries, "手动修正")
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"monthId":    monthID,
		"label":      monthData.Label,
		"entryCount": len(monthData.Entries),
		"dataPath":   "data/months/" + monthID + ".json",
	})
}

// ===== /api/delete-entry =====

func (s *Server) handleDeleteEntry(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	monthID := util.CleanText(payload["month"])
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	if existing == nil {
		s.writeError(w, http.StatusBadRequest, "该月份还没有可删除的数据。")
		return
	}
	index, ok := util.ToInt(payload["index"])
	if !ok || index < 0 || index >= len(existing.Entries) {
		s.writeError(w, http.StatusBadRequest, "没有找到要删除的明细。")
		return
	}
	entries := append([]*store.Entry{}, existing.Entries...)
	entries = append(entries[:index], entries[index+1:]...)
	monthData := store.MonthDataWithEntries(existing, monthID, entries, "手动删除")
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"monthId":    monthID,
		"label":      monthData.Label,
		"entryCount": len(monthData.Entries),
		"dataPath":   "data/months/" + monthID + ".json",
	})
}

// ===== /api/rename-category =====

func (s *Server) handleRenameCategory(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(r)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	monthID := util.CleanText(payload["month"])
	from := util.CleanText(payload["fromCategory"])
	to := util.CleanText(payload["toCategory"])
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	if from == "" || to == "" {
		s.writeError(w, http.StatusBadRequest, "请输入原分类和新分类。")
		return
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	if existing == nil {
		s.writeError(w, http.StatusBadRequest, "该月份还没有可修改的数据。")
		return
	}
	changed := 0
	entries := make([]*store.Entry, len(existing.Entries))
	for i, e := range existing.Entries {
		clone := *e
		if clone.Category == from {
			clone.Category = to
			clone.CorrectedAt = util.FormatNow()
			changed++
		}
		entries[i] = &clone
	}
	if changed == 0 {
		s.writeError(w, http.StatusBadRequest, "没有找到这个分类下的明细。")
		return
	}
	monthData := store.MonthDataWithEntries(existing, monthID, entries, "分类重命名")
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"monthId":      monthID,
		"label":        monthData.Label,
		"entryCount":   len(monthData.Entries),
		"changedCount": changed,
		"category":     to,
		"dataPath":     "data/months/" + monthID + ".json",
	})
}

// ===== /api/chat-edit =====

func (s *Server) handleChatEdit(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")
	var (
		monthID     string
		instruction string
		uploadPath  string
	)
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxImportSize); err != nil {
			s.writeError(w, http.StatusBadRequest, "无法解析上传内容："+err.Error())
			return
		}
		monthID = strings.TrimSpace(r.FormValue("month"))
		instruction = strings.TrimSpace(r.FormValue("instruction"))
		file, header, err := r.FormFile("file")
		if err == nil && header != nil && header.Filename != "" {
			defer file.Close()
			ext := strings.ToLower(filepath.Ext(header.Filename))
			if !isImage(ext) {
				s.writeError(w, http.StatusBadRequest, "对话修改截图仅支持 .png、.jpg、.jpeg 或 .webp。")
				return
			}
			original := util.SanitizeFilename(header.Filename)
			uploadPath = filepath.Join(s.store.UploadsDir(), monthID+"_edit_"+original)
			if err := os.MkdirAll(filepath.Dir(uploadPath), 0o755); err != nil {
				s.writeError(w, http.StatusInternalServerError, "无法创建上传目录："+err.Error())
				return
			}
			out, err := os.Create(uploadPath)
			if err != nil {
				s.writeError(w, http.StatusInternalServerError, "无法保存截图："+err.Error())
				return
			}
			if _, err := io.Copy(out, file); err != nil {
				out.Close()
				s.writeError(w, http.StatusInternalServerError, "无法保存截图："+err.Error())
				return
			}
			out.Close()
		}
	} else {
		payload, err := readJSON(r)
		if err != nil {
			s.writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		monthID = util.CleanText(payload["month"])
		instruction = util.CleanText(payload["instruction"])
	}

	monthID = monthIDFromInstruction(instruction, monthID)
	if !util.IsValidMonthID(monthID) {
		s.writeError(w, http.StatusBadRequest, "月份格式不正确，请选择类似 2026-05 的月份。")
		return
	}
	if instruction == "" && uploadPath == "" {
		s.writeError(w, http.StatusBadRequest, "请输入要修改的内容，或上传一张修改截图。")
		return
	}
	existing, err := s.store.LoadMonth(monthID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "无法读取既有月份："+err.Error())
		return
	}
	if existing == nil {
		s.writeError(w, http.StatusBadRequest, "该月份还没有可修改的数据。")
		return
	}

	actionsPayload := inferChatEditActions(instruction, existing)
	rawActions, _ := actionsPayload["actions"].([]any)
	if len(rawActions) == 0 {
		if !s.ai.HasAnyKey() {
			s.writeError(w, http.StatusBadRequest, "请先配置 OPENAI_API_KEY 或 GEMINI_API_KEY，才能使用对话修改。")
			return
		}
		ctx := parser.BuildChatEditContext(existing, instruction, uploadPath != "")
		extracted, err := parser.ChatEditExtract(s.ai, ctx, uploadPath)
		if err != nil {
			s.writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		actionsPayload = extracted
	}
	entries, changed := applyChatEditActions(existing.Entries, actionsPayload)
	if changed == 0 {
		s.writeError(w, http.StatusBadRequest, "没有执行任何修改，请把要改的项目、金额或分类说得更明确。")
		return
	}

	monthData := store.MonthDataWithEntries(existing, monthID, entries, "对话修改")
	if uploadPath != "" {
		attachment := map[string]any{
			"type": "image",
			"name": filepath.Base(uploadPath),
			"path": s.store.UploadRelativePath(uploadPath),
			"kind": "修改截图",
		}
		monthData.Attachments = upsertAttachment(monthData.Attachments, attachment)
	}
	if err := s.store.SaveMonth(monthID, monthData); err != nil {
		s.writeError(w, http.StatusInternalServerError, "保存数据失败："+err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"monthId":      monthID,
		"label":        monthData.Label,
		"entryCount":   len(monthData.Entries),
		"changedCount": changed,
		"message":      fmt.Sprintf("%s 已按指令完成 %d 处修改。", monthData.Label, changed),
		"dataPath":     "data/months/" + monthID + ".json",
	})
}

// readJSON parses the request body into a generic map.
func readJSON(r *http.Request) (map[string]any, error) {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		return nil, errors.New("读取请求失败：" + err.Error())
	}
	if len(body) == 0 {
		return map[string]any{}, nil
	}
	out := map[string]any{}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, errors.New("请求不是合法 JSON：" + err.Error())
	}
	return out, nil
}
