/**
 * 极简现代高颜值 Input 组件
 * 职责：提供高度自适应、带 Focus 品牌环发光的标准 Input
 * 依赖：cn 工具函数
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * 统一的高阶 Input 输入组件
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn("modern-input-field", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
