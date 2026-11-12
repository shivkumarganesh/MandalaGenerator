// The 3D preview registers a recorder here so the Project panel can ask for a turntable clip
// without reaching into the three.js scene.
export const turntable: { record: ((seconds: number) => Promise<Blob>) | null } = { record: null };
