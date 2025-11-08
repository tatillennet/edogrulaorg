// create-admin.js
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function createNewAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB bağlandı');
    
    const User = (await import('./models/User.js')).default;
    
    const email = 'admin@edogrula.org';
    const password = '287388726Bt.';
    
    // Önce mevcut kullanıcıyı SİL
    await User.deleteOne({ email: new RegExp('^' + email + '$', 'i') });
    console.log('🗑️ Eski kullanıcı silindi');
    
    // YENİ kullanıcı oluştur
    const hashed = await bcrypt.hash(password, 12); // 12 salt round
    const newUser = new User({
      email: email,
      password: hashed,
      role: 'admin',
      name: 'Admin'
    });
    
    await newUser.save();
    console.log('✅ YENİ admin kullanıcısı oluşturuldu!');
    console.log('📧 Email:', email);
    console.log('🔑 Şifre:', password);
    console.log('🔐 Hash:', hashed);
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

createNewAdmin();