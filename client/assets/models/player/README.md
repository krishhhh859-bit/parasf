# PARA SF: Commando Humanoid 3D Model Asset

Drop your 3D humanoid character model file here as:
`commando.glb`

Path: `client/assets/models/player/commando.glb`

---

### Required Model Specifications

1. **Format**: Binary GLTF (`.glb`) or standard `.gltf` with embedded/packed textures.
2. **Visual Style**:
   - Realistic military / special forces commando (Indian Army 10 PARA SF style).
   - Clean anatomical human proportions (head 1/7 - 1/8 height, realistic shoulders, waist, limbs, hands, and feet).
   - Military gear: Tactical helmet, plate carrier/vest, pouches, combat uniform, knee pads, combat boots, tactical gloves.
   - Reference image: `client/assets/logos/commando-reference.png`.
3. **Rig / Skeleton**:
   - Standard humanoid rigged skeleton (mixamo / humanoid hierarchy: Hips, Spine, Chest, Neck, Head, Shoulders, Arms, Forearms, Hands, Thighs, Shins, Feet).
4. **Animations (Optional / Preferred)**:
   - Idle / Breathing
   - Walk / Run / Moving
   - Aim / Stance
   (Animations with names containing "idle" or "walk" are automatically detected and transitioned).
5. **Scale**:
   - The game loader automatically normalizes the model height to ~1.78m and aligns feet to ground `y = 0`.
