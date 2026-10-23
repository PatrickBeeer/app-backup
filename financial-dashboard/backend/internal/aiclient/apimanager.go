package aiclient

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "strings"

    "financial-dashboard-backend/internal/util"
)

const defaultAPIManagerURL = "http://api-manager:3051"

// LLMGenerateRequest mirrors the api-manager /execute/llm-generate payload.
type LLMGenerateRequest struct {
    Model             string `json:"model,omitempty"`
    Task              string `json:"task,omitempty"`
    Tier              string `json:"tier,omitempty"`
    RetryAttempt      int    `json:"retry_attempt,omitempty"`
    Contents          any    `json:"contents,omitempty"`
    SystemInstruction any    `json:"systemInstruction,omitempty"`
    Config            any    `json:"config,omitempty"`
}

// APIManagerURL returns the configured api-manager base URL.
func (c *Client) APIManagerURL() string {
    raw := strings.TrimSpace(os.Getenv("API_MANAGER_URL"))
    if raw == "" {
        return defaultAPIManagerURL
    }
    return raw
}

// CallAPIManagerJSON submits a request to api-manager and parses JSON output.
func (c *Client) CallAPIManagerJSON(ctx context.Context, req LLMGenerateRequest) (map[string]any, error) {
    if ctx == nil {
        ctx = context.Background()
    }
    endpoint := strings.TrimRight(c.APIManagerURL(), "/") + "/api/v1/execute/llm-generate"
    payload, err := json.Marshal(req)
    if err != nil {
        return nil, err
    }

    httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set("Content-Type", "application/json")

    client := c.apiManagerHTTPClient
    if client == nil {
        client = c.httpClient
    }
    resp, err := client.Do(httpReq)
    if err != nil {
        return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes("API Manager 调用失败："+err.Error(), 500))}
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= http.StatusBadRequest {
        return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes(fmt.Sprintf("API Manager 返回 %d：%s", resp.StatusCode, string(respBody)), 500))}
    }

    var envelope struct {
        Code    int             `json:"code"`
        Message string          `json:"message"`
        Data    json.RawMessage `json:"data"`
    }
    if err := json.Unmarshal(respBody, &envelope); err != nil {
        return nil, &RecognitionError{Message: "API Manager 返回格式无法读取。"}
    }
    if envelope.Code != 0 {
        msg := strings.TrimSpace(envelope.Message)
        if msg == "" {
            msg = "API Manager 调用失败。"
        }
        return nil, &RecognitionError{Message: util.RedactSecrets(util.TruncateRunes(msg, 500))}
    }
    return parseAPIManagerData(envelope.Data)
}

func parseAPIManagerData(data json.RawMessage) (map[string]any, error) {
    if len(data) == 0 {
        return nil, &RecognitionError{Message: "AI识别结果为空。"}
    }
    var gemini struct {
        Candidates []struct {
            Content struct {
                Parts []struct {
                    Text string `json:"text"`
                } `json:"parts"`
            } `json:"content"`
        } `json:"candidates"`
    }
    if err := json.Unmarshal(data, &gemini); err == nil && len(gemini.Candidates) > 0 {
        var sb strings.Builder
        for _, part := range gemini.Candidates[0].Content.Parts {
            sb.WriteString(part.Text)
        }
        return parseJSONObject(sb.String())
    }

    var obj map[string]any
    if err := json.Unmarshal(data, &obj); err == nil {
        if _, ok := obj["entries"]; ok {
            return obj, nil
        }
    }

    var text string
    if err := json.Unmarshal(data, &text); err == nil {
        return parseJSONObject(text)
    }

    return nil, &RecognitionError{Message: "AI识别结果不是可读取的 JSON。"}
}
