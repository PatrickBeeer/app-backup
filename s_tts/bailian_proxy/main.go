package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultListenAddr             = ":5185"
	defaultModel                  = "cosyvoice-v3.5-flash"
	defaultVoiceEnrollmentModel   = "voice-enrollment"
	defaultDashScopeBaseURL       = "https://dashscope.aliyuncs.com"
	defaultTempDir                = "/root/projects/unityshop/apps/standalone_apps/s_tts/temp"
	defaultTempPublicPrefix       = "/standalone/s_tts/temp"
	defaultSpeechEndpoint         = "/compatible-mode/v1/audio/speech"
	defaultVoiceEnrollEndpoint    = "/api/v1/services/aigc/audio/voice-enrollments"
	defaultVoiceQueryEndpointTmpl = "/api/v1/services/aigc/audio/voice-enrollments/%s"
	maxJSONBodyBytes              = 2 * 1024 * 1024
)

type service struct {
	httpClient          *http.Client
	dashScopeBaseURL    string
	tempDir             string
	tempPublicPrefix    string
	speechEndpoint      string
	voiceEnrollEndpoint string
	voiceQueryEndpointT string
	keyFileCandidates   []string
}

type errorResponse struct {
	Success bool   `json:"success"`
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type voiceEnrollRequest struct {
	Prefix      string `json:"prefix"`
	AudioURL    string `json:"audio_url"`
	TargetModel string `json:"target_model,omitempty"`
}

type voiceStatusRequest struct {
	VoiceID string `json:"voice_id"`
}

type synthesizeRequest struct {
	Text  string `json:"text"`
	Voice string `json:"voice"`
	Model string `json:"model,omitempty"`
}

func main() {
	svc := &service{
		httpClient:          &http.Client{Timeout: 180 * time.Second},
		dashScopeBaseURL:    strings.TrimRight(getenv("STTS_DASHSCOPE_BASE_URL", defaultDashScopeBaseURL), "/"),
		tempDir:             strings.TrimSpace(getenv("STTS_TEMP_DIR", defaultTempDir)),
		tempPublicPrefix:    strings.TrimSpace(getenv("STTS_TEMP_PUBLIC_PREFIX", defaultTempPublicPrefix)),
		speechEndpoint:      strings.TrimSpace(getenv("STTS_DASHSCOPE_SPEECH_ENDPOINT", defaultSpeechEndpoint)),
		voiceEnrollEndpoint: strings.TrimSpace(getenv("STTS_DASHSCOPE_VOICE_ENROLL_ENDPOINT", defaultVoiceEnrollEndpoint)),
		voiceQueryEndpointT: strings.TrimSpace(getenv("STTS_DASHSCOPE_VOICE_QUERY_ENDPOINT_TEMPLATE", defaultVoiceQueryEndpointTmpl)),
		keyFileCandidates: []string{
			"/data/config/keys.json",
			"/app/config/keys.json",
			"./config/keys.json",
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", svc.handleHealth)
	mux.HandleFunc("/api/v3/voice-enroll", svc.handleVoiceEnroll)
	mux.HandleFunc("/api/v3/voice-status", svc.handleVoiceStatus)
	mux.HandleFunc("/api/v3/synthesize", svc.handleSynthesize)

	addr := getenv("STTS_BAILIAN_PROXY_ADDR", defaultListenAddr)
	log.Printf("s_tts bailian proxy listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatalf("bailian proxy server error: %v", err)
	}
}

func getenv(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *service) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "status": "ok"})
}

func (s *service) handleVoiceEnroll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	apiKey, err := s.readCosyKey()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	var req voiceEnrollRequest
	var tempFilePath string

	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if strings.Contains(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}

		req.Prefix = strings.TrimSpace(r.FormValue("prefix"))
		req.TargetModel = strings.TrimSpace(r.FormValue("target_model"))

		file, _, err := r.FormFile("audio_file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "audio_file is required")
			return
		}
		defer file.Close()

		tmpPath, err := s.saveUploadedTempFile(file)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		tempFilePath = tmpPath
		defer os.Remove(tempFilePath)

		req.AudioURL = s.buildTempPublicURL(r, tempFilePath)
	} else {
		if err := decodeJSONBody(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	if strings.TrimSpace(req.Prefix) == "" {
		writeError(w, http.StatusBadRequest, "prefix is required")
		return
	}
	if strings.TrimSpace(req.AudioURL) == "" {
		writeError(w, http.StatusBadRequest, "audio source is required")
		return
	}

	targetModel := strings.TrimSpace(req.TargetModel)
	if targetModel == "" {
		targetModel = defaultModel
	}

	payload := map[string]any{
		"model": defaultVoiceEnrollmentModel,
		"input": map[string]any{
			"target_model": targetModel,
			"prefix":       strings.TrimSpace(req.Prefix),
			"url":          strings.TrimSpace(req.AudioURL),
		},
	}

	upstreamURL := s.dashScopeBaseURL + ensurePrefixSlash(s.voiceEnrollEndpoint)
	upstreamPayload, statusCode, err := s.postJSON(upstreamURL, apiKey, payload)
	if err != nil {
		writeError(w, statusCode, err.Error())
		return
	}

	voiceID := firstStringPath(upstreamPayload,
		[]string{"output", "voice_id"},
		[]string{"output", "voiceId"},
		[]string{"voice_id"},
		[]string{"voiceId"},
	)

	writeJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"voice_id":     voiceID,
		"target_model": targetModel,
		"upload_mode":  tempFilePath != "",
		"raw_response": upstreamPayload,
	})
}

func (s *service) saveUploadedTempFile(src io.Reader) (string, error) {
	if strings.TrimSpace(s.tempDir) == "" {
		return "", errors.New("temp directory is not configured")
	}
	if err := os.MkdirAll(s.tempDir, 0o755); err != nil {
		return "", fmt.Errorf("create temp directory failed: %w", err)
	}

	file, err := os.CreateTemp(s.tempDir, "cosy_upload_*.wav")
	if err != nil {
		return "", fmt.Errorf("create temp file failed: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, src); err != nil {
		return "", fmt.Errorf("write temp file failed: %w", err)
	}

	return file.Name(), nil
}

func (s *service) buildTempPublicURL(r *http.Request, tempFilePath string) string {
	scheme := "http"
	if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") || r.TLS != nil {
		scheme = "https"
	}
	host := strings.TrimSpace(r.Host)
	fileName := tempFilePath
	if idx := strings.LastIndex(tempFilePath, "/"); idx >= 0 && idx < len(tempFilePath)-1 {
		fileName = tempFilePath[idx+1:]
	}
	prefix := strings.TrimRight(strings.TrimSpace(s.tempPublicPrefix), "/")
	if prefix == "" {
		prefix = defaultTempPublicPrefix
	}
	return fmt.Sprintf("%s://%s%s/%s", scheme, host, prefix, fileName)
}

func (s *service) handleVoiceStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	apiKey, err := s.readCosyKey()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	var req voiceStatusRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	voiceID := strings.TrimSpace(req.VoiceID)
	if voiceID == "" {
		writeError(w, http.StatusBadRequest, "voice_id is required")
		return
	}

	template := strings.TrimSpace(s.voiceQueryEndpointT)
	if template == "" {
		template = defaultVoiceQueryEndpointTmpl
	}
	queryPath := fmt.Sprintf(template, voiceID)
	upstreamURL := s.dashScopeBaseURL + ensurePrefixSlash(queryPath)

	upstreamPayload, statusCode, err := s.getJSON(upstreamURL, apiKey)
	if err != nil {
		writeError(w, statusCode, err.Error())
		return
	}

	status := strings.ToUpper(strings.TrimSpace(firstStringPath(upstreamPayload,
		[]string{"output", "status"},
		[]string{"status"},
	)))

	writeJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"voice_id":     voiceID,
		"status":       status,
		"raw_response": upstreamPayload,
	})
}

func (s *service) handleSynthesize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	apiKey, err := s.readCosyKey()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	var req synthesizeRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if strings.TrimSpace(req.Text) == "" {
		writeError(w, http.StatusBadRequest, "text is required")
		return
	}
	if strings.TrimSpace(req.Voice) == "" {
		writeError(w, http.StatusBadRequest, "voice is required")
		return
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = defaultModel
	}

	payload := map[string]any{
		"model":           model,
		"input":           strings.TrimSpace(req.Text),
		"voice":           strings.TrimSpace(req.Voice),
		"response_format": "mp3",
	}

	upstreamURL := s.dashScopeBaseURL + ensurePrefixSlash(s.speechEndpoint)
	respBytes, contentType, statusCode, err := s.postRaw(upstreamURL, apiKey, payload)
	if err != nil {
		writeError(w, statusCode, err.Error())
		return
	}

	if looksLikeJSON(contentType, respBytes) {
		var parsed any
		if err := json.Unmarshal(respBytes, &parsed); err != nil {
			writeError(w, http.StatusBadGateway, "upstream JSON parse failed")
			return
		}

		audioURL := firstStringPath(parsed,
			[]string{"output", "audio", "url"},
			[]string{"output", "audio_url"},
			[]string{"output", "url"},
			[]string{"audio_url"},
			[]string{"url"},
		)

		if audioURL != "" {
			writeJSON(w, http.StatusOK, map[string]any{
				"success":      true,
				"audio_url":    audioURL,
				"model":        model,
				"raw_response": parsed,
			})
			return
		}

		base64Audio := firstStringPath(parsed,
			[]string{"output", "audio", "data"},
			[]string{"output", "audio"},
			[]string{"data"},
		)
		if base64Audio != "" {
			writeJSON(w, http.StatusOK, map[string]any{
				"success":      true,
				"audio_base64": base64Audio,
				"model":        model,
				"raw_response": parsed,
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"model":        model,
			"raw_response": parsed,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"model":        model,
		"audio_base64": base64.StdEncoding.EncodeToString(respBytes),
	})
}

func (s *service) readCosyKey() (string, error) {
	for _, candidate := range s.keyFileCandidates {
		raw, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}

		var payload struct {
			Keys []map[string]any `json:"keys"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			continue
		}

		for _, item := range payload.Keys {
			if value, ok := item["k_cosy_tts"]; ok {
				key := strings.TrimSpace(fmt.Sprint(value))
				if key != "" {
					return key, nil
				}
			}
		}
	}

	return "", errors.New("k_cosy_tts not found in keys.json")
}

func decodeJSONBody(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxJSONBodyBytes)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("invalid json body: %w", err)
	}
	return nil
}

func ensurePrefixSlash(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "/") {
		return trimmed
	}
	return "/" + trimmed
}

func (s *service) postJSON(url string, apiKey string, payload any) (map[string]any, int, error) {
	respBytes, _, statusCode, err := s.postRaw(url, apiKey, payload)
	if err != nil {
		return nil, statusCode, err
	}

	var parsed map[string]any
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("upstream returned non-json payload")
	}
	return parsed, http.StatusOK, nil
}

func (s *service) getJSON(url string, apiKey string) (map[string]any, int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("read upstream response failed: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, resp.StatusCode, fmt.Errorf("upstream status=%d message=%s", resp.StatusCode, truncate(string(respBytes), 300))
	}

	var parsed map[string]any
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("upstream returned non-json payload")
	}

	return parsed, http.StatusOK, nil
}

func (s *service) postRaw(url string, apiKey string, payload any) ([]byte, string, int, error) {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, "", http.StatusBadRequest, fmt.Errorf("marshal payload failed: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, "", http.StatusBadGateway, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, audio/mpeg, application/octet-stream")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", http.StatusBadGateway, fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", http.StatusBadGateway, fmt.Errorf("read upstream response failed: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", resp.StatusCode, fmt.Errorf("upstream status=%d message=%s", resp.StatusCode, truncate(string(respBytes), 320))
	}

	return respBytes, resp.Header.Get("Content-Type"), http.StatusOK, nil
}

func looksLikeJSON(contentType string, body []byte) bool {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	if strings.Contains(strings.ToLower(mediaType), "json") {
		return true
	}
	trimmed := strings.TrimSpace(string(body))
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func firstStringPath(payload any, paths ...[]string) string {
	for _, path := range paths {
		current := payload
		ok := true
		for _, key := range path {
			asMap, mapOK := current.(map[string]any)
			if !mapOK {
				ok = false
				break
			}
			next, exists := asMap[key]
			if !exists {
				ok = false
				break
			}
			current = next
		}
		if ok {
			value := strings.TrimSpace(fmt.Sprint(current))
			if value != "" && value != "<nil>" {
				return value
			}
		}
	}
	return ""
}

func truncate(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max] + "..."
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	if statusCode <= 0 {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, errorResponse{
		Success: false,
		Code:    statusCode,
		Message: strings.TrimSpace(message),
	})
}
