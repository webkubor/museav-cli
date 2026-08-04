// 空间详情页三个 Tab（成员/日志转发/设置）的聚合出口。
// 拆分先例：src/pages/usage/ —— 各 Tab 独立成文件，index.tsx 只做 re-export，
// workspace-dashboard.tsx 继续从 '@/pages/settings/workspace-detail' 导入。

export { MembersTab } from './members-tab'
export { LogsForwardingTab } from './logs-forwarding-tab'
export { SettingsTab } from './settings-tab'
