import { SocksProxyAgent } from 'socks-proxy-agent';
import { PROXY, PROXY_INDEX, PROXIES, ROLE } from './config.js';

// Workers: single proxy (assigned by PROXY_INDEX)
let _agent = null;
function getWorkerAgent() {
  if (!_agent) {
    const { host, socks5_port, user, pass } = PROXY;
    _agent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${socks5_port}`);
  }
  return _agent;
}

// Controller: round-robin across all proxies
const _agents = PROXIES.map(p =>
  new SocksProxyAgent(`socks5://${p.user}:${p.pass}@${p.host}:${p.socks5_port}`)
);
let _rrIndex = 0;
function getRoundRobinAgent() {
  const agent = _agents[_rrIndex % _agents.length];
  _rrIndex++;
  return agent;
}

export const getAgent = ROLE === 'controller' ? getRoundRobinAgent : getWorkerAgent;

export function proxyLabel() {
  return `proxy[${PROXY_INDEX}] ${PROXY.host}:${PROXY.socks5_port}`;
}
