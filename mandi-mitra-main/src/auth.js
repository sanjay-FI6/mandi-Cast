export const getUser = () => { try { return JSON.parse(localStorage.getItem('mandi-mitra-user')) || null; } catch { return null; } };
export const saveUser = (user) => localStorage.setItem('mandi-mitra-user', JSON.stringify(user));
export const clearUser = () => localStorage.removeItem('mandi-mitra-user');
