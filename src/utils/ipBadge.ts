/**
 * 節點 IP 版本識別
 *
 * CFSM 的 /api/servers 返回 ip_v4 / ip_v6 為 '1'/'0' 標記（非地址本身），
 * 用於識別節點是 IPv4、IPv6 或雙棧。主題在節點卡上以徽章展示。
 */

export interface IpBadgeInfo {
  label: string
  className: string
  title: string
}

/** 根據 ip_v4 / ip_v6 標記生成徽章資訊；無 IP 時返回 null（不顯示） */
export function getIpBadge(ipv4?: string, ipv6?: string): IpBadgeInfo | null {
  const hasV4 = ipv4 === '1'
  const hasV6 = ipv6 === '1'

  if (hasV4 && hasV6) {
    return {
      label: 'IPv4+IPv6',
      className: 'ip-badge--dual',
      title: '该节点同时支持 IPv4 与 IPv6',
    }
  }
  if (hasV4) {
    return {
      label: 'IPv4',
      className: 'ip-badge--v4',
      title: '该节点为 IPv4',
    }
  }
  if (hasV6) {
    return {
      label: 'IPv6',
      className: 'ip-badge--v6',
      title: '该节点为 IPv6',
    }
  }
  return null
}
