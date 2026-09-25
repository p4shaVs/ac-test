// =============================================================================
// Recommended blacklist pack: troll & giant props.
//
// Cheat menus' object spawners drop map-sized props on players and roads —
// giant stunt blocks, XXL ramps, boulders/asteroids ("spawning a mountain"),
// map buildings and terrain pieces ("spawning a house"), cages that trap a
// player. No roleplay script creates these as networked objects, so blocking
// them costs nothing and removes the most visible griefing.
//
// Every entry is resolved against the model catalog (src/data/gta-models.json),
// so the pack can only ever contain real model names. Containers, stunt tubes
// and other props that race/job scripts legitimately network are left out on
// purpose.
// =============================================================================
import raw from "@/data/gta-models.json";

type Row = [string, string, number, number];
const ROWS = (raw as unknown as { rows: Row[] }).rows;
const OBJECT_KIND = 3; // KIND_NAMES index for "object"

const EXACT = new Set([
  // fairground / landmark props used to block roads and trap players
  "prop_windmill_01", "prop_rural_windmill", "prop_windmill1", "prop_windmill2",
  "prop_ld_ferris_wheel", "p_ferris_wheel_amo_l", "p_ferris_wheel_amo_p", "prop_ferris_car_01", "p_ferris_car_01",
  "p_cablecar_s", "prop_air_bigradar", "prop_huge_display_01",
  "prop_dock_crane_01", "prop_dock_crane_02", "port_xr_cranelg",
  // "mountains": giant rocks and asteroids
  "prop_asteroid_01", "prop_rock_4_big", "prop_rock_4_big2",
  // huge novelty props
  "p_spinning_anus_s", "stt_prop_stunt_soccer_ball", "stt_prop_stunt_soccer_lball", "stt_prop_stunt_soccer_sball",
  "sum_prop_dufocore_01a", "prop_alien_egg_01", "prop_cj_big_boat", "apa_mp_apa_yacht",
  "m25_2_prop_m52_giantflower_01a", "m25_2_prop_m52_giantflower_02a", "prop_cs_dildo_01",
  // cages used to trap players
  "prop_gold_cont_01", "prop_gold_cont_01b", "prop_rub_cage01a", "prop_rub_cage01b", "prop_rub_cage01c",
  "prop_fnclink_05crnr1",
  // XXL stunt ramps
  "stt_prop_ramp_jump_xxl", "stt_prop_ramp_spiral_xxl", "stt_prop_ramp_spiral_l_xxl",
  "xs_prop_arena_jump_xxl_01a", "xs_prop_arena_jump_xxl_01a_sf", "xs_prop_arena_jump_xxl_01a_wl",
  // map buildings ("spawning a house")
  "xs_prop_arena_building_01a", "hei_kt1_08_buildingtop_a", "m25_2_int_02_skyline_buildings",
]);

const PATTERNS: RegExp[] = [
  /_bblock_huge_0\d$/,          // giant stunt blocks (stt/ar/as/bkr/imp)
  /^h4_prop_rock_lrg_\d+$/,     // Cayo boulders
  /^prop_test_boulder_0\d$/,
  /^csx_(coastboulder|seabed_rock)/,
  /terrain/,                    // terrain / landscape pieces
  /^lf_house_/,                 // map houses
  /^xs_propint2_building_/,
  // map geometry by area code — never a script prop
  // ("lr_"/"lr2_" are Lowrider DLC props, not a map area — excluded.)
  /^(cs[1-6]|ch[1-3]|dt1|hw1|kt1|id[12]|sc1|ss1|po1|sp1|bh1|ap1)_/,
  /^vb_lod_/,
];

export interface PresetModel {
  name: string;
  label: string;
  hash: number;
}

let cached: PresetModel[] | null = null;

export function trollPropPreset(): PresetModel[] {
  if (cached) return cached;
  const out: PresetModel[] = [];
  for (const r of ROWS) {
    if (r[2] !== OBJECT_KIND) continue;
    const name = r[0];
    if (EXACT.has(name) || PATTERNS.some((p) => p.test(name))) {
      out.push({ name, label: r[1], hash: r[3] >>> 0 });
    }
  }
  cached = out;
  return out;
}
