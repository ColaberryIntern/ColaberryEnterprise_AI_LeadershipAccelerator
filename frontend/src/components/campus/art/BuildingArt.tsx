import React from 'react';
import { art, RoofKind } from './artColor';
import { WallWithWindows, Door, PedimentRoof, GableRoof, TowerRoof, FlatRoof, DomeRoof } from './roofsClassic';
import { OfficeTower, Pavilion } from './roofsModern';
import { Amphitheater, Arcade } from './roofsSpecial';
import { HqTowerArt } from './hqTower';

/** The building whose interior is the Campus HQ (ArrivalPanel's HQ_BUILDING). */
const HQ_BUILDING_ID = 'career';

/**
 * One building, drawn as the prototype draws it (drawBuilding): a soft ground shadow, the body (lifted 4 px on hover, focus or
 * when it is "here" via CSS on .body-g), and the white name pill 22 px below the ground line (inverted to ink on hover, focus or
 * here). The keyboard / aria wrapper stays in CampusWorldMap; this is only the picture, so it is aria-hidden.
 */
/** label absent = no pill (the compact maps are small pictures; the side nav lists the names right below). */
export interface BuildingArtProps { id: string; kind: RoofKind; w: number; h: number; label?: string }

const CLASSIC: Partial<Record<RoofKind, React.ComponentType<{ id: string; w: number; h: number }>>> = {
  pediment: PedimentRoof, gable: GableRoof, tower: TowerRoof, flat: FlatRoof, dome: DomeRoof,
};

function Body({ id, kind, w, h }: Omit<BuildingArtProps, 'label'>): React.ReactElement {
  if (id === HQ_BUILDING_ID) return <HqTowerArt w={w} h={h} />; // C83: the map draws the tower the HQ scene opens into
  if (kind === 'office') return <OfficeTower id={id} w={w} h={h} />;
  if (kind === 'pavilion') return <Pavilion id={id} w={w} h={h} />;
  if (kind === 'amphi') return <Amphitheater id={id} w={w} h={h} />;
  if (kind === 'arcade') return <Arcade id={id} w={w} h={h} />;
  const Roof = CLASSIC[kind]!;
  return (
    <>
      <WallWithWindows id={id} w={w} h={h} />
      <Roof id={id} w={w} h={h} />
      <Door id={id} />
    </>
  );
}

/** The label pill's width, as the prototype computes it from the name. */
export const labelWidth = (label: string): number => label.length * 6.6 + 22;

export default function BuildingArt({ id, kind, w, h, label }: BuildingArtProps): React.ReactElement {
  const lw = label ? labelWidth(label) : 0;
  return (
    <g aria-hidden="true" data-roof={kind}>
      <ellipse cx={0} cy={3} rx={w / 2 + 14} ry={9} fill={art('bld-shadow')} />
      <g className="body-g">
        <Body id={id} kind={kind} w={w} h={h} />
      </g>
      {label && (
        <g className="lbl" transform="translate(0,22)" data-testid={`cm-label-${id}`}>
          <rect x={-lw / 2} y={-10} width={lw} height={20} rx={10} />
          <text x={0} y={4} textAnchor="middle">{label}</text>
        </g>
      )}
    </g>
  );
}
