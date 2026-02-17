import {
  Globe, Sparkles, FileText, BookOpen, Zap, Briefcase,
  Smartphone, PenTool, GraduationCap, MessageSquare, Megaphone,
  Home, Hash, Lightbulb, Heart, Star, Shield, Settings,
  Mail, Code, Camera, Music, Palette, Layers, Target,
  type LucideIcon
} from 'lucide-react'

/**
 * Maps icon name strings to Lucide icon components.
 * Used to persist icon choices as strings (in electron-store)
 * while rendering them as proper SVG icons in the UI.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  globe: Globe,
  sparkles: Sparkles,
  'file-text': FileText,
  'book-open': BookOpen,
  zap: Zap,
  briefcase: Briefcase,
  smartphone: Smartphone,
  'pen-tool': PenTool,
  'graduation-cap': GraduationCap,
  'message-square': MessageSquare,
  megaphone: Megaphone,
  home: Home,
  hash: Hash,
  lightbulb: Lightbulb,
  heart: Heart,
  star: Star,
  shield: Shield,
  settings: Settings,
  mail: Mail,
  code: Code,
  camera: Camera,
  music: Music,
  palette: Palette,
  layers: Layers,
  target: Target
}

/** All available icon names for the icon picker */
export const AVAILABLE_ICONS = Object.keys(ICON_MAP)

/** Resolve an icon name string to a Lucide component, with fallback to Zap */
export function getIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] || Zap
}

/** Render an icon by name string with given className */
export function CategoryIcon({
  name,
  className = 'w-4 h-4'
}: {
  name: string
  className?: string
}): JSX.Element {
  const Icon = getIconComponent(name)
  return <Icon className={className} />
}
