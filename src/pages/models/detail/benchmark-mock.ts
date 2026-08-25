/**
 * Benchmark 区块的类型与 Mock 数据（§5）。
 *
 * 单独成文件不是为了分层好看，而是 react-refresh/only-export-components 要求：
 * 组件文件只能导出组件，混着导出常量会让 Fast Refresh 失效。
 *
 * 真实接口接入后（§8 第 6 步）只替换 MOCK_BENCHMARK 的来源，BenchmarkSection
 * 本身不动 —— 它接受 data prop，对数据来源无感。
 */

export interface BenchmarkSummary {
  label: string
  value: string
  unit?: string
}

export interface BenchmarkGroup {
  title: string
  evaluations: Array<{ name: string; description: string; score: number; result: string }>
}

export interface BenchmarkData {
  summaries: BenchmarkSummary[]
  groups: BenchmarkGroup[]
}

export const MOCK_BENCHMARK: BenchmarkData = {
  summaries: [
    { label: '综合得分', value: '58.9', unit: 'Index' },
    { label: '行业排名', value: '#3' },
    { label: '领先百分位', value: '92', unit: '%' },
  ],
  groups: [
    {
      title: '推理与知识',
      evaluations: [
        { name: 'MMLU-Pro', description: '跨学科多选题准确率', score: 82, result: '82.4%' },
        { name: 'GPQA Diamond', description: '研究生级科学问答', score: 68, result: '68.1%' },
      ],
    },
    {
      title: '代码能力',
      evaluations: [
        { name: 'SWE-Bench Verified', description: '真实仓库缺陷修复通过率', score: 61, result: '61.2%' },
        { name: 'LiveCodeBench', description: '竞赛编程实时评测', score: 74, result: '74.0%' },
      ],
    },
  ],
}
