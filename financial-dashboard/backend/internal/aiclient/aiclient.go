package aiclient

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"financial-dashboard-backend/internal/util"
)

const (
	defaultOpenAIModel = "gpt-4.1-mini"
	defaultGeminiModel = "gemini-2.5-flash"
	openAIChatURL      = "https://api.openai.com/v1/chat/completions"
	geminiBaseURL      = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"
)

// RecognitionError signals a non-fatal AI failure that should be reported back
// to the user but not crash the request.
type RecognitionError struct {
	Message string
}

func (r *RecognitionError) Error() string { return r.Message }

// IsRecognitionError reports whether err originated from the AI call.
func IsRecognitionError(err error) bool {
	var rec *RecognitionError
	return errors.As(err, &rec)
}

// Client wires HTTP calls to OpenAI and Gemini.
type Client struct {
	httpClient           *http.Client
	apiManagerHTTPClient *http.Client
}

// New creates a Client with sensible HTTP timeouts.
func New() *Client {
	return &Client{
		httpClient:           &http.Client{Timeout: 90 * time.Second},
		apiManagerHTTPClient: &http.Client{Timeout: 6 * time.Minute},
	}
}

// HasAnyKey reports whether either OpenAI or Gemini credentials are present.
func (c *Client) HasAnyKey() bool {
	return c.GeminiAPIKey() != "" || c.OpenAIAPIKey() != ""
}

// OpenAIAPIKey returns the trimmed key (or empty if missing).
func (c *Client) OpenAIAPIKey() string {
	return strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
}

// GeminiAPIKey returns the trimmed key (or empty if missing).
func (c *Client) GeminiAPIKey() string {
	return strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
}

// OpenAIModel returns the configured OpenAI model name.
func (c *Client) OpenAIModel() string {
	model := strings.TrimSpace(os.Getenv("OPENAI_MODEL"))
	if model == "" {
		return defaultOpenAIModel
	}
	return model
}

// GeminiModel returns the configured Gemini model name.
func (c *Client) GeminiModel() string {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		return defaultGeminiModel
	}
	return model
}

// CallOpenAIJSON posts a single user-prompt message and returns the parsed
// JSON object emitted by the model.
func (c *Client) CallOpenAIJSON(prompt string) (map[string]any, error) {
	key := c.OpenAIAPIKey()
	if key == "" {
		return nil, &RecognitionError{Message: "未配置 OPENAI_API_KEY。"}
	}
	payload := map[string]any{
		"model": c.OpenAIModel(),
		"messages": []map[string]any{
			{"role": "user", "content": prompt},
		},
		"temperature":     0,
		"response_format": map[string]any{"type": "json_object"},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, openAIChatURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes("OpenAI修改服务调用失败："+err.Error(), 500))}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes(fmt.Sprintf("OpenAI修改服务返回 %d：%s", resp.StatusCode, string(respBody)), 500))}
	}
	return parseOpenAIJSON(respBody)
}

// CallOpenAIStructured calls OpenAI chat with a system+user message pair and
// returns the JSON object the model emitted.
func (c *Client) CallOpenAIStructured(systemPrompt string, userContent any) (map[string]any, error) {
	key := c.OpenAIAPIKey()
	if key == "" {
		return nil, &RecognitionError{Message: "未配置 OPENAI_API_KEY。"}
	}
	userBytes, err := json.Marshal(userContent)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"model": c.OpenAIModel(),
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": string(userBytes)},
		},
		"temperature":     0,
		"response_format": map[string]any{"type": "json_object"},
	}
	return c.callOpenAIChat(key, payload)
}

// CallOpenAIWithImage submits a multimodal prompt to OpenAI.
func (c *Client) CallOpenAIWithImage(systemPrompt, userText string, imagePath string) (map[string]any, error) {
	key := c.OpenAIAPIKey()
	if key == "" {
		return nil, &RecognitionError{Message: "未配置 OPENAI_API_KEY。"}
	}
	dataURL, err := imageDataURL(imagePath)
	if err != nil {
		return nil, &RecognitionError{Message: "无法读取截图：" + err.Error()}
	}
	payload := map[string]any{
		"model": c.OpenAIModel(),
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "text", "text": userText},
					{"type": "image_url", "image_url": map[string]any{"url": dataURL}},
				},
			},
		},
		"temperature":     0,
		"response_format": map[string]any{"type": "json_object"},
	}
	return c.callOpenAIChat(key, payload)
}

func (c *Client) callOpenAIChat(key string, payload map[string]any) (map[string]any, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, openAIChatURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes("AI识别服务调用失败："+err.Error(), 500))}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes(fmt.Sprintf("AI识别服务返回 %d：%s", resp.StatusCode, string(respBody)), 500))}
	}
	return parseOpenAIJSON(respBody)
}

func parseOpenAIJSON(body []byte) (map[string]any, error) {
	var envelope struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, &RecognitionError{Message: "AI识别结果不是可读取的 JSON。"}
	}
	if len(envelope.Choices) == 0 {
		return nil, &RecognitionError{Message: "AI识别结果为空。"}
	}
	return parseJSONObject(envelope.Choices[0].Message.Content)
}

// CallGeminiJSON submits parts to Gemini and parses the JSON object out of the
// response.
func (c *Client) CallGeminiJSON(parts []map[string]any) (map[string]any, error) {
	key := c.GeminiAPIKey()
	if key == "" {
		return nil, &RecognitionError{Message: "未配置 GEMINI_API_KEY。"}
	}
	payload := map[string]any{
		"contents": []map[string]any{
			{"role": "user", "parts": parts},
		},
		"generationConfig": map[string]any{
			"temperature":      0,
			"responseMimeType": "application/json",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf(geminiBaseURL, c.GeminiModel(), key)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes("Gemini识别服务调用失败："+err.Error(), 500))}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes(fmt.Sprintf("Gemini识别服务返回 %d：%s", resp.StatusCode, string(respBody)), 500))}
	}
	var envelope struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, &RecognitionError{Message: "Gemini识别结果不是可读取的 JSON。"}
	}
	if len(envelope.Candidates) == 0 {
		return nil, &RecognitionError{Message: "Gemini识别结果为空。"}
	}
	var sb strings.Builder
	for _, p := range envelope.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	return parseJSONObject(sb.String())
}

var fenceRegex = regexp.MustCompile("^```(?:json)?\\s*")
var trailingFence = regexp.MustCompile("\\s*```$")

func parseJSONObject(content string) (map[string]any, error) {
	text := strings.TrimSpace(content)
	if strings.HasPrefix(text, "```") {
		text = fenceRegex.ReplaceAllString(text, "")
		text = trailingFence.ReplaceAllString(text, "")
	}
	out := map[string]any{}
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return nil, &RecognitionError{Message: "AI识别结果不是可读取的 JSON。"}
	}
	return out, nil
}

// ImageMimeType returns the inferred mime type for an image file.
func ImageMimeType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == "" {
		return "image/png"
	}
	if mt := mime.TypeByExtension(ext); mt != "" {
		// Strip charset suffix.
		if idx := strings.IndexByte(mt, ';'); idx >= 0 {
			mt = mt[:idx]
		}
		return strings.TrimSpace(mt)
	}
	return "image/png"
}

// EncodedImage returns the base64 encoded contents of the file.
func EncodedImage(path string) (string, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(body), nil
}

func imageDataURL(path string) (string, error) {
	encoded, err := EncodedImage(path)
	if err != nil {
		return "", err
	}
	return "data:" + ImageMimeType(path) + ";base64," + encoded, nil
}
