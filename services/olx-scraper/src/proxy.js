import { SocksProxyAgent } from 'socks-proxy-agent';
import { PROXY } from './config.js';

let _agent = null;

export function getAgent() {
  if (!_agent) {
    const { host, socks5_port, user, pass } = PROXY;
    _agent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${socks5_port}`);
  }
  return _agent;
}

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
