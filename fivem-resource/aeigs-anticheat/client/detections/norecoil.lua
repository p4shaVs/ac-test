-- norecoil.lua — No Recoil (RAPOR-ONLY, yumuşak sinyal)
-- Gerçek silahlar sürekli ateş sırasında kamerayı yukarı iter (geri tepme).
-- No-recoil script'leri bu doğal sapmayı sıfırlar. Full-auto ateş sırasında
-- kamera dikey açısının UZUN SÜRE (çok sayıda atış) neredeyse hiç değişmemesi
-- şüphelidir. Oyuncu becerisi/mouse hassasiyeti çok değişken olduğu için
-- TİTİZ: yüksek atış sayısı ister, ASLA ban atmaz — panelde görünür.
local shotsNoRecoil = 0
local lastPitch = nil

CreateThread(function()
  while true do
    local S = Aeigs.S
    if Aeigs.rule('anti_no_recoil', false) and Aeigs.active() and S.ped
      and IsPedShooting(S.ped) and S.weapon and S.weapon ~= 0 then
      local rot = GetGameplayCamRot(2)
      if lastPitch then
        local dp = rot.x - lastPitch
        -- Kamera hiç yukarı hareket etmedi (dp <= 0.05) = geri tepme yok
        if dp <= 0.05 then
          shotsNoRecoil = shotsNoRecoil + 1
        else
          shotsNoRecoil = math.max(0, shotsNoRecoil - 2)
        end
        if shotsNoRecoil >= 40 then
          shotsNoRecoil = 0
          Aeigs.report('NO_RECOIL', 'MEDIUM', {})
        end
      end
      lastPitch = rot.x
      Wait(50)
    else
      shotsNoRecoil = 0
      lastPitch = nil
      Wait(500)
    end
  end
end)
