import { get } from '@/lib/request'
import type { TaskDetail, TaskListParams, TaskListResponse } from '@/types'

export function listTasks(params?: TaskListParams) {
  return get<TaskListResponse>('async-tasks', params)
}

export function getTask(requestId: string) {
  return get<TaskDetail>(`async-tasks/${encodeURIComponent(requestId)}`)
}
