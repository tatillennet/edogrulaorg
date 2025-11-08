// reset-password.js
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB bağlandı');
    
    // User model'ini dinamik import et
    const UserModule = await import('./models/User.js');
    const User = UserModule.default;
    
    const email = 'admin@edogrula.org';
    const newPassword = '287388726Bt.';
    
    console.log('🔍 Kullanıcı aranıyor:', email);
    
    // Mevcut kullanıcıyı kontrol et
    const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') });
    console.log('🔍 Mevcut kullanıcı:', user ? 'BULUNDU' : 'BULUNAMADI');
    
    if (user) {
      console.log('🔍 Kullanıcı detayları:', {
        email: user.email,
        role: user.role,
        name: user.name,
        hasPassword: !!user.password
      });
    } else {
      console.log('❌ Kullanıcı bulunamadı, yeni kullanıcı oluşturuluyor...');
    }
    
    // Şifreyi güncelle veya kullanıcı oluştur
    const hashed = await bcrypt.hash(newPassword, 10);
    
    const result = await User.findOneAndUpdate(
      { email: new RegExp('^' + email + '$', 'i') },
      { 
        $set: { 
          password: hashed,
          role: 'admin',
          name: 'Admin'
        } 
      },
      { 
        upsert: true, // Eğer yoksa oluştur
        new: true 
      }
    );
    
    console.log('✅ İşlem başarılı!');
    console.log('📧 Email:', email);
    console.log('🔑 Yeni şifre:', newPassword);
    console.log('👤 Son durum:', result ? 'GÜNCELLENDİ/OLUŞTURULDU' : 'HATA');
    
    if (result) {
      console.log('🎉 Şifre sıfırlama tamamlandı! Artık giriş yapabilirsin.');
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

resetAdminPassword();