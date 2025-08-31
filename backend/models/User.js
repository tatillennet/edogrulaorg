import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true, // boşlukları kırpar
      lowercase: true // otomatik küçük harfe çevirir
    },
    password: {
      type: String,
      required: true,
      minlength: 6 // güvenlik için minimum uzunluk
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user"
    }
  },
  { timestamps: true }
);

// 🔑 Modeli oluştur ve default export et
const User = mongoose.model("User", userSchema);
export default User;
