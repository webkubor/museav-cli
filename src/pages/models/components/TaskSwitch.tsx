/**
 * 「可体验任务」显式切换（PRD App.tsx:19488-19507 PlaygroundCapabilitySwitch /
 * 19781-19797 可体验任务按钮组逐字对齐，2026-07-29 本地起 PRD 原型用 ego-lite 实测过：
 * GPT-5 Image 在文生图/图生图间点击切换，瞬间生效且改变下方 composer 形态）。
 * 只在同一类别下模型真的支持 >=2 个任务时渲染，1 个时任务已定、不显示。
 */
import { experienceTaskLabel, type ExperienceTaskType } from '../model-experience-data'

export interface TaskSwitchProps {
  tasks: ExperienceTaskType[]
  value: ExperienceTaskType
  onChange: (task: ExperienceTaskType) => void
}

export function TaskSwitch({ tasks, value, onChange }: TaskSwitchProps) {
  if (tasks.length < 2) return null
  return (
    <div className="models-task-switch" aria-label="task-switch">
      {tasks.map((task) => (
        <button
          key={task}
          type="button"
          className={value === task ? 'active' : ''}
          onClick={() => onChange(task)}
        >
          {experienceTaskLabel(task)}
        </button>
      ))}
    </div>
  )
}

export default TaskSwitch
