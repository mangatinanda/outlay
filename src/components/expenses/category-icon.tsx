import {
  Baby,
  Briefcase,
  Car,
  Dog,
  Dumbbell,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  MoreHorizontal,
  Music,
  Phone,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  "shopping-cart": ShoppingCart,
  zap: Zap,
  home: Home,
  car: Car,
  utensils: Utensils,
  film: Film,
  "heart-pulse": HeartPulse,
  "shopping-bag": ShoppingBag,
  "graduation-cap": GraduationCap,
  shield: Shield,
  repeat: Repeat,
  "more-horizontal": MoreHorizontal,
  plane: Plane,
  baby: Baby,
  dog: Dog,
  dumbbell: Dumbbell,
  gift: Gift,
  wrench: Wrench,
  wifi: Wifi,
  phone: Phone,
  receipt: Receipt,
  "piggy-bank": PiggyBank,
  briefcase: Briefcase,
  music: Music,
  sprout: Sprout,
};

interface CategoryIconProps {
  icon: string;
  color: string;
  size?: "sm" | "md";
}

export function CategoryIcon({ icon, color, size = "md" }: CategoryIconProps) {
  const IconComponent = iconMap[icon] || Receipt;
  const sizeClasses = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div
      className={`${sizeClasses} flex items-center justify-center rounded-lg`}
      style={{ backgroundColor: `${color}20` }}
    >
      <IconComponent className={iconSize} style={{ color }} />
    </div>
  );
}
