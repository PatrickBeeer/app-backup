package util

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	monthIDPattern    = regexp.MustCompile(`^\d{4}-\d{2}$`)
	filenameSafeRegex = regexp.MustCompile(`[^0-9A-Za-z._\-\x{4e00}-\x{9fff}]+`)
	apiKeySK          = regexp.MustCompile(`sk-[A-Za-z0-9_\-]+`)
	apiKeyAIza        = regexp.MustCompile(`AIza[0-9A-Za-z_\-]+`)
)

// CleanText trims surrounding whitespace from arbitrary string-like values.
func CleanText(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		// Avoid scientific notation; collapse trailing zeros.
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		f := float64(v)
		if f == float64(int64(f)) {
			return strconv.FormatInt(int64(f), 10)
		}
		return strconv.FormatFloat(f, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case bool:
		return strconv.FormatBool(v)
	case time.Time:
		return v.Format("2006-01-02")
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

// ToNumber converts arbitrary value to a float64. The second return value is
// false when the value cannot be parsed as a number.
func ToNumber(value any) (float64, bool) {
	if value == nil {
		return 0, false
	}
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		t := strings.TrimSpace(v)
		t = strings.ReplaceAll(t, ",", "")
		t = strings.ReplaceAll(t, "¥", "")
		t = strings.ReplaceAll(t, "￥", "")
		if t == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(t, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// ToInt parses a value as an integer. Returns (0, false) on failure.
func ToInt(value any) (int, bool) {
	if value == nil {
		return 0, false
	}
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case float32:
		return int(v), true
	case string:
		t := strings.TrimSpace(v)
		if t == "" {
			return 0, false
		}
		i, err := strconv.Atoi(t)
		if err == nil {
			return i, true
		}
		f, err := strconv.ParseFloat(t, 64)
		if err == nil {
			return int(f), true
		}
		return 0, false
	default:
		return 0, false
	}
}

// IsValidMonthID reports whether the provided id matches the YYYY-MM format.
func IsValidMonthID(id string) bool {
	return monthIDPattern.MatchString(id)
}

// MonthLabel converts a "2026-05" style id into "2026年5月".
func MonthLabel(id string) string {
	parts := strings.SplitN(id, "-", 2)
	if len(parts) != 2 {
		return id
	}
	month, err := strconv.Atoi(parts[1])
	if err != nil {
		return id
	}
	return fmt.Sprintf("%s年%d月", parts[0], month)
}

// SanitizeFilename returns a filename safe for the local filesystem while
// preserving Chinese characters.
func SanitizeFilename(name string) string {
	clean := filepath.Base(name)
	clean = filenameSafeRegex.ReplaceAllString(clean, "_")
	if clean == "" {
		clean = "upload.bin"
	}
	return clean
}

// TextSourceRef matches the Python implementation: text-<sha1[:16]>.
func TextSourceRef(monthID, text string) string {
	hash := sha1.Sum([]byte(monthID + "\n" + text))
	return "text-" + hex.EncodeToString(hash[:])[:16]
}

// FormatNow returns the current local time formatted similar to the legacy
// server output.
func FormatNow() string {
	return time.Now().Format("2006-01-02 15:04")
}

// RoundMoney rounds to two decimal places.
func RoundMoney(value float64) float64 {
	return float64(int64(value*100+sign(value)*0.5)) / 100
}

func sign(v float64) float64 {
	if v < 0 {
		return -1
	}
	return 1
}

// RedactSecrets removes obvious API key patterns from outbound error text.
func RedactSecrets(text string) string {
	text = apiKeySK.ReplaceAllString(text, "sk-***")
	text = apiKeyAIza.ReplaceAllString(text, "AIza***")
	return text
}

// TruncateRunes returns at most max runes from the input.
func TruncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// FirstNonEmpty returns the first argument with non-empty trimmed content.
func FirstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
