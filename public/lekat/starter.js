// Lekat — deck contoh Bahasa Inggris (bisa dihapus kapan saja).
(function (G) {
  'use strict';
  // [Word, Meaning, IPA, Example, Example Meaning]
  const VOCAB = [
    ['achieve', 'mencapai, meraih', '/əˈtʃiːv/', 'She worked hard to achieve her goals.', 'Dia bekerja keras untuk mencapai tujuannya.'],
    ['actually', 'sebenarnya', '/ˈæktʃuəli/', 'I actually enjoyed the movie.', 'Sebenarnya aku menikmati filmnya.'],
    ['afford', 'mampu (membeli/membayar)', '/əˈfɔːrd/', "I can't afford a new phone right now.", 'Aku belum mampu beli HP baru sekarang.'],
    ['although', 'meskipun', '/ɔːlˈðoʊ/', 'Although it was raining, we went out.', 'Meskipun hujan, kami tetap keluar.'],
    ['appointment', 'janji temu', '/əˈpɔɪntmənt/', 'I have a doctor’s appointment at 3 p.m.', 'Aku ada janji dengan dokter jam 3 sore.'],
    ['approach', 'pendekatan; mendekati', '/əˈproʊtʃ/', 'We need a different approach.', 'Kita butuh pendekatan yang berbeda.'],
    ['available', 'tersedia', '/əˈveɪləbəl/', 'Is this seat available?', 'Apakah kursi ini kosong/tersedia?'],
    ['aware', 'sadar, menyadari', '/əˈwer/', 'Are you aware of the risks?', 'Apakah kamu sadar akan risikonya?'],
    ['borrow', 'meminjam', '/ˈbɑːroʊ/', 'Can I borrow your pen?', 'Boleh aku pinjam pulpenmu?'],
    ['challenge', 'tantangan', '/ˈtʃælɪndʒ/', 'Learning English is a fun challenge.', 'Belajar bahasa Inggris adalah tantangan yang seru.'],
    ['common', 'umum, biasa', '/ˈkɑːmən/', 'It’s a common mistake.', 'Itu kesalahan yang umum.'],
    ['confident', 'percaya diri', '/ˈkɑːnfɪdənt/', 'She feels confident speaking English.', 'Dia merasa percaya diri berbicara bahasa Inggris.'],
    ['consider', 'mempertimbangkan', '/kənˈsɪdər/', 'Please consider my offer.', 'Tolong pertimbangkan tawaranku.'],
    ['convenient', 'praktis, nyaman (waktu/tempat)', '/kənˈviːniənt/', 'Is Monday convenient for you?', 'Apakah hari Senin cocok buatmu?'],
    ['decide', 'memutuskan', '/dɪˈsaɪd/', 'I decided to learn every day.', 'Aku memutuskan untuk belajar setiap hari.'],
    ['deserve', 'pantas mendapatkan', '/dɪˈzɜːrv/', 'You deserve a break.', 'Kamu pantas istirahat.'],
    ['effort', 'usaha', '/ˈefərt/', 'Thanks for your effort.', 'Terima kasih atas usahamu.'],
    ['eventually', 'akhirnya (setelah lama)', '/ɪˈventʃuəli/', 'Eventually, he found a job.', 'Akhirnya dia mendapat pekerjaan.'],
    ['familiar', 'akrab, tidak asing', '/fəˈmɪliər/', 'This song sounds familiar.', 'Lagu ini terdengar tidak asing.'],
    ['figure out', 'memahami, menemukan solusi', '/ˈfɪɡjər aʊt/', "I can't figure out this problem.", 'Aku tidak bisa menemukan solusi masalah ini.'],
    ['improve', 'meningkatkan, memperbaiki', '/ɪmˈpruːv/', 'Reading helps improve your vocabulary.', 'Membaca membantu meningkatkan kosakatamu.'],
    ['instead', 'sebagai gantinya', '/ɪnˈsted/', "Let's walk instead of taking a taxi.", 'Ayo jalan kaki saja daripada naik taksi.'],
    ['journey', 'perjalanan', '/ˈdʒɜːrni/', 'The journey took five hours.', 'Perjalanannya memakan waktu lima jam.'],
    ['knowledge', 'pengetahuan', '/ˈnɑːlɪdʒ/', 'Knowledge is power.', 'Pengetahuan adalah kekuatan.'],
    ['likely', 'kemungkinan besar', '/ˈlaɪkli/', "It's likely to rain tomorrow.", 'Kemungkinan besar besok hujan.'],
    ['maintain', 'mempertahankan, merawat', '/meɪnˈteɪn/', 'It’s hard to maintain a habit.', 'Sulit mempertahankan sebuah kebiasaan.'],
    ['meanwhile', 'sementara itu', '/ˈmiːnwaɪl/', 'Meanwhile, she was cooking dinner.', 'Sementara itu, dia sedang memasak makan malam.'],
    ['mention', 'menyebutkan', '/ˈmenʃən/', "Don't mention it.", 'Sama-sama / tidak usah dipikirkan.'],
    ['necessary', 'perlu, diperlukan', '/ˈnesəseri/', 'Is it necessary to bring my ID?', 'Apakah perlu membawa KTP-ku?'],
    ['obvious', 'jelas, nyata', '/ˈɑːbviəs/', 'The answer is obvious.', 'Jawabannya sudah jelas.'],
    ['opportunity', 'kesempatan', '/ˌɑːpərˈtuːnəti/', "Don't miss this opportunity.", 'Jangan lewatkan kesempatan ini.'],
    ['patient', 'sabar; pasien', '/ˈpeɪʃənt/', 'Be patient with yourself.', 'Bersabarlah dengan dirimu sendiri.'],
    ['prefer', 'lebih suka', '/prɪˈfɜːr/', 'I prefer tea to coffee.', 'Aku lebih suka teh daripada kopi.'],
    ['probably', 'mungkin, barangkali', '/ˈprɑːbəbli/', "I'll probably be late.", 'Aku mungkin akan terlambat.'],
    ['purpose', 'tujuan', '/ˈpɜːrpəs/', 'What is the purpose of your visit?', 'Apa tujuan kunjunganmu?'],
    ['realize', 'menyadari', '/ˈriːəlaɪz/', 'I didn’t realize it was so late.', 'Aku tidak sadar sudah selarut ini.'],
    ['recommend', 'merekomendasikan', '/ˌrekəˈmend/', 'Can you recommend a good book?', 'Bisa rekomendasikan buku yang bagus?'],
    ['reliable', 'dapat diandalkan', '/rɪˈlaɪəbəl/', 'He is a reliable friend.', 'Dia teman yang bisa diandalkan.'],
    ['remind', 'mengingatkan', '/rɪˈmaɪnd/', 'Please remind me to call her.', 'Tolong ingatkan aku untuk meneleponnya.'],
    ['require', 'membutuhkan, mensyaratkan', '/rɪˈkwaɪər/', 'This job requires experience.', 'Pekerjaan ini membutuhkan pengalaman.'],
    ['schedule', 'jadwal', '/ˈskedʒuːl/', 'My schedule is full this week.', 'Jadwalku penuh minggu ini.'],
    ['suggest', 'menyarankan', '/səɡˈdʒest/', 'I suggest we leave early.', 'Aku sarankan kita berangkat lebih awal.'],
    ['support', 'mendukung; dukungan', '/səˈpɔːrt/', 'Thank you for your support.', 'Terima kasih atas dukunganmu.'],
    ['suppose', 'mengira, menduga', '/səˈpoʊz/', 'I suppose you are right.', 'Kurasa kamu benar.'],
    ['though', 'meskipun; tapi (di akhir kalimat)', '/ðoʊ/', "It's expensive. It's good, though.", 'Itu mahal. Tapi bagus sih.'],
    ['upset', 'kesal, sedih', '/ʌpˈset/', 'She was upset about the news.', 'Dia sedih/kesal karena berita itu.'],
    ['used to', 'dulu biasanya', '/ˈjuːst tə/', 'I used to live in Bandung.', 'Dulu aku tinggal di Bandung.'],
    ['weird', 'aneh', '/wɪrd/', 'That’s a weird idea.', 'Itu ide yang aneh.'],
    ['worth', 'layak, sepadan', '/wɜːrθ/', 'The trip was worth it.', 'Perjalanannya sepadan.'],
    ['yet', 'belum (di kalimat negatif/tanya)', '/jet/', "I haven't finished yet.", 'Aku belum selesai.']
  ];
  const PHRASAL = [
    ['give up', 'menyerah'], ['look forward to', 'menantikan'], ['run out of', 'kehabisan'], ['come up with', 'memunculkan (ide)'],
    ['get along with', 'akur dengan'], ['put off', 'menunda'], ['turn down', 'menolak; mengecilkan'], ['look after', 'merawat, menjaga'],
    ['find out', 'mengetahui, mencari tahu'], ['set up', 'menyiapkan, mendirikan'], ['catch up', 'mengejar ketertinggalan'], ['show up', 'datang, muncul']
  ];
  const CLOZE = [
    ['She {{c1::has lived}} in Jakarta {{c2::since}} 2015.', 'Present perfect + since (titik waktu).'],
    ['If I {{c1::were}} you, I {{c2::would}} take the job.', 'Second conditional: If + past, would + V1.'],
    ['I’m not used to {{c1::waking::wake (bentuk?)}} up early.', 'be used to + V-ing.'],
    ['He {{c1::didn’t go}} to work yesterday because he {{c2::was}} sick.', 'Simple past.'],
    ['By the time we arrived, the movie {{c1::had started}}.', 'Past perfect: kejadian lebih dulu di masa lalu.'],
    ['This is the book {{c1::which}} I told you about.', 'Relative pronoun untuk benda: which/that.'],
    ['I {{c1::have been studying}} English {{c2::for}} two hours.', 'Present perfect continuous + for (durasi).'],
    ['She is {{c1::interested}} {{c2::in}} learning languages.', 'interested in + V-ing.'],
    ['You {{c1::should}} see a doctor.', 'should = saran.'],
    ['The letter {{c1::was written}} by my grandfather.', 'Passive voice (past): was/were + V3.']
  ];
  const LISTEN = [
    ['How are you doing today?', 'Apa kabarmu hari ini?'],
    ['Could you say that again, please?', 'Bisa ulangi lagi?'],
    ['I would like a cup of coffee.', 'Saya mau secangkir kopi.'],
    ['What do you do for a living?', 'Apa pekerjaanmu?'],
    ['Let me think about it.', 'Biar aku pikirkan dulu.'],
    ['It takes about twenty minutes.', 'Butuh sekitar dua puluh menit.']
  ];

  function installStarter() {
    const { Col, DB } = G;
    if (DB.list('notes').some(n => (n.tags || []).includes('starter'))) { DB.meta('starterInstalled', true); return; } // sudah ada (mis. dari perangkat lain)
    const root = 'English';
    const vocabDeck = Col.deckByName(root + '::Vocabulary', true);
    const phrDeck = Col.deckByName(root + '::Phrasal Verbs', true);
    const grDeck = Col.deckByName(root + '::Grammar', true);
    const lsDeck = Col.deckByName(root + '::Listening', true);
    const ntV = Col.typeByKey('en-vocab'), ntB = Col.typeByKey('basic-rev'), ntC = Col.typeByKey('cloze'), ntL = Col.typeByKey('en-listen');
    VOCAB.forEach(([w, m, ipa, ex, exm]) => Col.addNote(ntV.id, { Word: w, Meaning: m, Pronunciation: ipa, Example: ex, 'Example Meaning': exm }, ['english', 'vocab', 'starter'], vocabDeck.id));
    PHRASAL.forEach(([w, m]) => Col.addNote(ntB.id, { Front: w, Back: m }, ['english', 'phrasal', 'starter'], phrDeck.id));
    CLOZE.forEach(([t, e]) => Col.addNote(ntC.id, { Text: t, 'Back Extra': e }, ['english', 'grammar', 'starter'], grDeck.id));
    LISTEN.forEach(([s, m]) => Col.addNote(ntL.id, { Sentence: s, Meaning: m }, ['english', 'listening', 'starter'], lsDeck.id));
    DB.meta('starterInstalled', true);
  }
  G.Starter = { installStarter };
})(window);
