package excelparser

import (
    "bytes"
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "net/url"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "time"
)

const defaultExcelParserURL = "http://apps-excel-parser:4001"

// SheetPreview mirrors the excel-parser /parse sheet payload.
type SheetPreview struct {
    Name      string     `json:"name"`
    TotalRows int        `json:"total_rows"`
    TotalCols int        `json:"total_columns"`
    Rows      [][]string `json:"rows"`
    CSV       string     `json:"csv"`
}

// ImagePreview mirrors the excel-parser /parse image payload.
type ImagePreview struct {
    Name     string `json:"name"`
    Sheet    string `json:"sheet"`
    Row      int    `json:"row"`
    Column   int    `json:"column"`
    Cell     string `json:"cell"`
    MimeType string `json:"mime_type"`
    Base64   string `json:"base64"`
}

// ParseResponse mirrors the excel-parser /parse response payload.
type ParseResponse struct {
    FileName string         `json:"file_name"`
    Sheets   []SheetPreview `json:"sheets"`
    Images   []ImagePreview `json:"images"`
}

// Client calls the excel-parser service.
type Client struct {
    baseURL    string
    httpClient *http.Client
}

// New creates a new excel-parser client with defaults.
func New() *Client {
    baseURL := strings.TrimSpace(os.Getenv("EXCEL_PARSER_URL"))
    if baseURL == "" {
        baseURL = defaultExcelParserURL
    }
    return &Client{
        baseURL: strings.TrimRight(baseURL, "/"),
        httpClient: &http.Client{
            Timeout: 90 * time.Second,
        },
    }
}

// Parse uploads an Excel file and returns CSV + image extraction.
func (c *Client) Parse(ctx context.Context, filePath string, maxRows, maxImages int) (*ParseResponse, error) {
    if ctx == nil {
        ctx = context.Background()
    }
    if strings.TrimSpace(filePath) == "" {
        return nil, errors.New("file path is empty")
    }
    f, err := os.Open(filePath)
    if err != nil {
        return nil, err
    }
    defer f.Close()

    endpoint, err := url.Parse(c.baseURL + "/parse")
    if err != nil {
        return nil, err
    }
    query := endpoint.Query()
    if maxRows > 0 {
        query.Set("max_rows", strconv.Itoa(maxRows))
    }
    if maxImages > 0 {
        query.Set("max_images", strconv.Itoa(maxImages))
    }
    endpoint.RawQuery = query.Encode()

    var body bytes.Buffer
    writer := multipart.NewWriter(&body)
    part, err := writer.CreateFormFile("file", filepath.Base(filePath))
    if err != nil {
        return nil, err
    }
    if _, err := io.Copy(part, f); err != nil {
        return nil, err
    }
    if maxRows > 0 {
        _ = writer.WriteField("max_rows", strconv.Itoa(maxRows))
    }
    if maxImages > 0 {
        _ = writer.WriteField("max_images", strconv.Itoa(maxImages))
    }
    if err := writer.Close(); err != nil {
        return nil, err
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), &body)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", writer.FormDataContentType())

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= http.StatusBadRequest {
        var failure struct {
            Error string `json:"error"`
        }
        if json.Unmarshal(respBody, &failure) == nil && strings.TrimSpace(failure.Error) != "" {
            return nil, fmt.Errorf("excel-parser error: %s", strings.TrimSpace(failure.Error))
        }
        return nil, fmt.Errorf("excel-parser error: %s", strings.TrimSpace(string(respBody)))
    }

    var parsed ParseResponse
    if err := json.Unmarshal(respBody, &parsed); err != nil {
        return nil, err
    }
    return &parsed, nil
}
