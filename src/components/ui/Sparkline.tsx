import React from 'react'

interface SparklineProps {
  color: string
  gradientId: string
  pathData: string
  fillPathData: string
}

export const Sparkline: React.FC<SparklineProps> = ({
  color,
  gradientId,
  pathData,
  fillPathData
}) => {
  return (
    <svg width="100%" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d={pathData} 
        stroke={color} 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d={fillPathData} 
        fill={`url(#${gradientId})`} 
        opacity="0.08"
      />
      <defs>
        <linearGradient id={gradientId} x1="60" y1="0" x2="60" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor={color}/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}
