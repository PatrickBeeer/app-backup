package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"financial-dashboard-backend/internal/aiclient"
	"financial-dashboard-backend/internal/excelparser"
	"financial-dashboard-backend/internal/server"
	"financial-dashboard-backend/internal/store"
)

func main() {
	addr := flag.String("addr", envOr("FINANCE_DASHBOARD_ADDR", "127.0.0.1:5173"), "listen address")
	root := flag.String("root", appRootDefault(), "application root (where data/ uploads/ live)")
	flag.Parse()

	if *root == "" {
		log.Fatal("application root is empty")
	}
	absRoot, err := filepath.Abs(*root)
	if err != nil {
		log.Fatalf("resolve root: %v", err)
	}
	if err := loadEnvFile(filepath.Join(absRoot, ".env")); err != nil {
		log.Printf("warn: load .env: %v", err)
	}

	staticDir := server.ChooseStaticDir(absRoot)
	dataDir := filepath.Join(staticDir, "data")
	uploadsDir := filepath.Join(absRoot, "uploads")
	st, err := store.NewWith(store.Options{
		Root:       staticDir,
		DataDir:    dataDir,
		UploadsDir: uploadsDir,
	})
	if err != nil {
		log.Fatalf("init store: %v", err)
	}
	if err := st.SyncEmbeddedData(); err != nil {
		log.Printf("warn: sync embedded data: %v", err)
	}

	ai := aiclient.New()
	excelClient := excelparser.New()
	srv := server.New(absRoot, st, ai, excelClient, log.Default())

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("财务驾驶舱已启动：http://%s/", *addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func appRootDefault() string {
	if v := strings.TrimSpace(os.Getenv("FINANCE_DASHBOARD_ROOT")); v != "" {
		return v
	}
	exe, err := os.Executable()
	if err == nil {
		// Default to two levels up from the binary (.run/bin/finance-dashboard).
		return filepath.Clean(filepath.Join(filepath.Dir(exe), "..", ".."))
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}

// loadEnvFile reads a KEY=value file and exports each entry into the process
// environment unless it is already set. Mirrors the Python load_local_env.
func loadEnvFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		os.Setenv(key, value)
	}
	return scanner.Err()
}
