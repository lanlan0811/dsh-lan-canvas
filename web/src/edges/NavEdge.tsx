/**
 * 派生跳转连线：页面内链接解析出的页面关系。
 *
 * 与手动 InkEdge 区分：只读、虚线、强调色、无手绘淡影；
 * 不提供选中/删除（端点由页面 HTML 决定，不是用户可编辑的项目数据）。
 */
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export function NavEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} className="nav-edge" />
}
