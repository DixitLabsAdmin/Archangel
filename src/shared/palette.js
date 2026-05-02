// src/shared/palette.js
// Eurelyas palette — synthesized from Ajit's MTG references:
//   - Angel of Mercy (Benson, 8th Ed): cool whites, icy blue shadow
//   - Angel of Mercy (Baga, 10th Ed):  burnished antique gold armor
//   - Angel of Fury (Parkinson):       golden light-ring effect

export const PALETTE = {
  // Core form
  robeLight:     '#F4F6FA',   // near-white with faint cool cast
  robeMid:       '#D6DFEB',
  robeShadow:    '#B8C9DE',
  robeDeep:      '#7E9AB8',   // deep fabric fold, inside-of-hood

  // Wings
  featherLight:  '#FAFBFD',
  featherMid:    '#CFDBEA',
  featherShadow: '#8FA6C0',
  featherEdge:   '#C9D8EC',

  // Gold (staff, armor trim, halo)
  goldLight:     '#E8C87A',
  goldMid:       '#C9A961',
  goldDeep:      '#8B6F2E',
  goldGlow:      '#FFE9A8',

  // Energy / effects
  energyWarm:    '#F5D876',
  energyBloom:   '#FFE9A8',

  // Aware/scanning accent (used sparingly)
  awareCyan:     '#A8D8F0',

  // Background chat panel
  panelBg:       'rgba(20,24,32,0.92)',
  panelBorder:   'rgba(184,201,222,0.18)',
  panelText:     '#E8EDF5',
  panelDim:      '#8B9AAE'
};

export const STATES = {
  IDLE:      'idle',         // small, meditating, wings folded
  AWARE:     'aware',        // notices user activity, soft alertness
  SUMMONED:  'summoned',     // full presence, wings unfurled, staff forward
  THINKING:  'thinking',     // staff gathers light at crown
  SPEAKING:  'speaking',     // slight forward lean, light at chest
  WORKING:   'working',      // staff lowered, executing tools autonomously
  DISMISSED: 'dismissed',    // returning to idle
  SLEEPING:  'sleeping'      // very dim, barely visible
};
