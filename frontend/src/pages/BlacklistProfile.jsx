// frontend/src/pages/BusinessProfile.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

// Bu component'in stillerini ve diğer ikonları kendi projenize göre ekleyebilirsiniz.
// Bu sadece temel bir iskelettir ve yönlendirme mantığını içerir.
import { FaArrowLeft } from 'react-icons/fa6';

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const api = axios.create({ baseURL: API_BASE });

export default function BusinessProfile() {
  const { slug } = useParams();
  const navigate = useNavigate(); // Yönlendirme için hook

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBusinessData = async () => {
      if (!slug) {
        setLoading(false);
        setError('İşletme kimliği bulunamadı.');
        return;
      }
      
      try {
        setLoading(true);
        // Backend'deki /api/businesses/:slug endpoint'ini çağırıyoruz.
        // Bu endpoint, hem normal işletmeleri hem de kara liste fallbak'ini içeriyor.
        const res = await api.get(`/api/businesses/${slug}`);

        // --- EN ÖNEMLİ KISIM BURASI ---
        // Gelen verinin durumunu (status) kontrol et
        if (res.data.status === 'blacklist') {
          // Eğer işletme kara listedeyse, kullanıcıyı beklemeden
          // /kara-liste sayfasına yönlendir.
          console.log('Kara listede işletme bulundu, yönlendiriliyor...');
          navigate(`/kara-liste/${slug}`, { replace: true });
          // { replace: true } kullanıcının geri tuşuna basarak bu sayfaya dönmesini engeller.
          return; // Yönlendirme sonrası bu component'te başka işlem yapma.
        }
        
        // Eğer normal bir işletme ise, state'i güncelle ve sayfayı göster.
        setBusiness(res.data.business);

      } catch (err) {
        console.error('İşletme verisi alınırken hata:', err);
        setError('Aradığınız işletme bulunamadı veya bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    };

    fetchBusinessData();
  }, [slug, navigate]);

  // Yüklenme veya yönlendirme sırasında boş bir ekran gösterilebilir.
  if (loading || !business) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        İşletme bilgileri yükleniyor...
      </div>
    );
  }

  // Hata durumunda hata mesajını göster.
  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>
        {error}
      </div>
    );
  }

  // Normal işletme profili JSX kodu (senin ekran görüntündeki gibi)
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: 'auto' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '20px' }}>
        <FaArrowLeft /> Geri
      </button>
      <h1>{business.name}</h1>
      <p>
        <strong>Instagram:</strong> {business.instagramUsername} <br />
        <strong>Telefon:</strong> {business.phone} <br />
        <strong>Adres:</strong> {business.address}
      </p>
      <p>
        <strong>Açıklama:</strong> {business.description || 'Bu işletme henüz açıklama eklemedi.'}
      </p>
      {/* BURADAN SONRASI SENİN MEVCUT BusinessProfile.jsx SAYFANIN GÖRÜNÜM KODU
        Ekran görüntündeki rezervasyon formu, bilgiler vb. hepsi burada yer alacak.
        Bu iskeleti kendi mevcut kodunla zenginleştirebilirsin.
        Önemli olan yukarıdaki useEffect içindeki yönlendirme mantığıdır.
      */}
    </div>
  );
}