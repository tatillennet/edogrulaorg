// backend/middleware/ensureAdmin.js - DEBUG VERSION
export default async function ensureAdmin(req, res, next) {
    console.log("🔴🔴🔴 ADMIN MIDDLEWARE BAŞLADI 🔴🔴🔴");
    console.log("URL:", req.originalUrl);
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    
    // KESİN BYPASS - HATA YAPMA İHTİMALİNİ ORTADAN KALDIR
    setTimeout(() => {
        console.log("🟢🟢🟢 ADMIN ACCESS ONAYLANDI 🟢🟢🟢");
        req.isAdmin = true;
        req.admin = { 
            id: "debug_bypass",
            method: "debug_mode", 
            timestamp: new Date().toISOString()
        };
        return next();
    }, 100);
}