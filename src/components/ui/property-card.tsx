import { Link } from "@tanstack/react-router";
import { BedDouble, Bath, MapPin, ShieldCheck, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/property-helpers";

export interface PropertyCardData {
  id: string;
  title: string;
  city?: string | null;
  neighborhood?: string | null;
  rent_value: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  cover?: string;
  verified?: boolean;
  favorited?: boolean;
}

interface PropertyCardProps {
  property: PropertyCardData;
  onToggleFavorite?: (id: string) => void;
  variant?: "horizontal" | "featured";
  className?: string;
}

/**
 * PropertyCard — canonical listing card used across search, favorites,
 * dashboards. Mobile-first, matches the design mockups.
 */
export function PropertyCard({
  property,
  onToggleFavorite,
  variant = "horizontal",
  className,
}: PropertyCardProps) {
  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");

  return (
    <Link
      to="/properties/$id"
      params={{ id: property.id }}
      className={cn(
        "group block rounded-2xl bg-card shadow-card transition active:scale-[0.99] overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "flex",
          variant === "featured" ? "flex-col" : "flex-row gap-0",
        )}
      >
        <div
          className={cn(
            "relative shrink-0 bg-muted overflow-hidden",
            variant === "featured"
              ? "aspect-[16/10] w-full"
              : "size-32 sm:size-36",
          )}
        >
          {property.cover ? (
            <img
              src={property.cover}
              alt={property.title}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid size-full place-items-center text-xs text-muted-foreground">
              sem foto
            </div>
          )}
          {property.verified && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-success-foreground">
              <ShieldCheck className="size-3" />
              Verificado
            </span>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleFavorite(property.id);
              }}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/95 shadow-sm transition hover:scale-110"
              aria-label={property.favorited ? "Desfavoritar" : "Favoritar"}
            >
              <Heart
                className={cn(
                  "size-4",
                  property.favorited
                    ? "fill-destructive text-destructive"
                    : "text-muted-foreground",
                )}
              />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-primary leading-tight">
              {formatBRL(property.rent_value)}
            </span>
            <span className="text-xs text-muted-foreground">/mês</span>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {property.title}
          </p>
          {location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {location}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            {property.bedrooms != null && (
              <span className="flex items-center gap-1">
                <BedDouble className="size-3.5" /> {property.bedrooms}
              </span>
            )}
            {property.bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath className="size-3.5" /> {property.bathrooms}
              </span>
            )}
            {property.area != null && (
              <span>{property.area} m²</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
