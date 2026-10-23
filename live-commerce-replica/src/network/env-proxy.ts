import * as http from 'node:http';

type ProxyCapableHttp = typeof http & {
  setGlobalProxyFromEnv?: () => () => void;
};

/**
 * 启用 Node.js 内置的环境变量代理（http.setGlobalProxyFromEnv）。
 * 该 API 在 Node 22.21+ 引入，但部分发行版编译的 Node 可能未暴露。
 * 不可用时降级为 no-op（不使用代理），避免阻断服务启动。
 */
export function enableEnvProxy(): () => void {
  const setGlobalProxyFromEnv = (http as ProxyCapableHttp).setGlobalProxyFromEnv;
  if (!setGlobalProxyFromEnv) {
    console.warn('[env-proxy] http.setGlobalProxyFromEnv 不可用，跳过环境代理配置。如需经代理出网，请使用 Node 22.21+ 官方构建。');
    return () => {};
  }

  return setGlobalProxyFromEnv();
}
