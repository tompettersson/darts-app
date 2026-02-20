import React, { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeColors } from '../theme'

export type PickerItem = {
  id: string
  label: string
  sub: string
  accentColor?: string
}

type Props = {
  items: PickerItem[]
  selectedIndex: number
  onChange: (index: number) => void
  onConfirm: (index: number) => void
  colors: ThemeColors
}

export default function ArcadeScrollPicker({ items, selectedIndex, onChange, onConfirm, colors }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clamp = (idx: number) => Math.max(0, Math.min(items.length - 1, idx))

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onChange(clamp(selectedIndex - 1))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onChange(clamp(selectedIndex + 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm(selectedIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex, onChange, onConfirm, items.length])

  // Wheel scroll (native listener mit { passive: false } um preventDefault zu erlauben)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelTimer.current) return // debounce
      const dir = e.deltaY > 0 ? 1 : -1
      onChange(clamp(selectedIndex + dir))
      wheelTimer.current = setTimeout(() => { wheelTimer.current = null }, 150)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selectedIndex, onChange, items.length])

  // Touch swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(deltaY) > 30) {
      const dir = deltaY > 0 ? 1 : -1
      onChange(clamp(selectedIndex + dir))
    }
  }, [selectedIndex, onChange, items.length])

  const handleItemClick = (index: number) => {
    if (index === selectedIndex) {
      onConfirm(index)
    } else {
      onChange(index)
    }
  }

  // 3D style calculation per item
  const getItemStyle = (index: number): CSSProperties => {
    const offset = index - selectedIndex
    const absOffset = Math.abs(offset)

    const translateY = offset * 72
    const rotateX = offset * -25
    const scale = Math.max(0.6, 1 - absOffset * 0.18)
    const opacity = Math.max(0.2, 1 - absOffset * 0.35)
    const zIndex = 10 - absOffset

    const isFocused = offset === 0

    return {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      transform: `translateY(calc(-50% + ${translateY}px)) perspective(800px) rotateX(${rotateX}deg) scale(${scale})`,
      opacity,
      zIndex,
      transition: 'all 0.35s ease',
      cursor: 'pointer',
      padding: isFocused ? '18px 20px' : '14px 16px',
      borderRadius: 14,
      background: colors.bgCard,
      border: isFocused
        ? `2px solid ${colors.accent}`
        : `1px solid ${colors.border}`,
      boxShadow: isFocused
        ? `0 0 24px ${colors.ledGlow}, 0 0 8px ${colors.accent}`
        : 'none',
      textAlign: 'center' as const,
      pointerEvents: absOffset > 2 ? 'none' as const : 'auto' as const,
      userSelect: 'none' as const,
    }
  }

  const containerStyle: CSSProperties = {
    position: 'relative',
    height: 400,
    overflow: 'hidden',
    width: 'min(480px, 92vw)',
    margin: '0 auto',
    touchAction: 'none',
  }

  // Gradient overlays for fade effect
  const gradientTop: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    background: `linear-gradient(${colors.bg}, transparent)`,
    zIndex: 20,
    pointerEvents: 'none',
  }

  const gradientBottom: CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    background: `linear-gradient(transparent, ${colors.bg})`,
    zIndex: 20,
    pointerEvents: 'none',
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div style={gradientTop} />
      {items.map((item, i) => (
        <div
          key={item.id}
          style={getItemStyle(i)}
          onClick={() => handleItemClick(i)}
        >
          <div style={{
            fontWeight: 700,
            fontSize: i === selectedIndex ? 20 : 16,
            lineHeight: 1.3,
            color: i === selectedIndex ? colors.accent : colors.fg,
            transition: 'font-size 0.35s ease, color 0.35s ease',
            marginBottom: 4,
          }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 12,
            lineHeight: 1.4,
            color: colors.fgMuted,
            opacity: i === selectedIndex ? 1 : 0.7,
            transition: 'opacity 0.35s ease',
          }}>
            {item.sub}
          </div>
        </div>
      ))}
      <div style={gradientBottom} />
    </div>
  )
}
