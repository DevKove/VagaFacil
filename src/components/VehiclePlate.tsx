import type { HTMLAttributes } from 'react';

type VehiclePlateProps = HTMLAttributes<HTMLSpanElement> & {
  value: string;
  compact?: boolean;
};

export function VehiclePlate({ value, compact = false, className = '', ...props }: VehiclePlateProps) {
  const plate = value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 7);
  const mercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plate);
  return (
    <span className={`vehicle-plate ${mercosul ? 'mercosul' : 'national'} ${compact ? 'compact' : ''} ${className}`.trim()} aria-label={`Placa ${plate}, padrão ${mercosul ? 'Mercosul' : 'nacional antigo'}`} {...props}>
      <span className="vehicle-plate-header">
        {mercosul ? <><span className="vehicle-plate-country">BRASIL</span><span className="vehicle-plate-flag" aria-hidden="true">🇧🇷</span><span className="vehicle-plate-code">BR</span></> : <><span className="vehicle-plate-seal" aria-hidden="true">★</span><span className="vehicle-plate-country">BRASIL</span><span className="vehicle-plate-code">BR</span></>}
      </span>
      <strong>{plate}</strong>
    </span>
  );
}
