local checkHitbox = LPH_JIT_MAX(function()
    if not CoreAC.Config.Weapons.AntiHitboxModifier then
        return
    end
-- WlhYWFhYWFhYWFhYWFhYWENDQ0NDQ0NDQ0NDQ0NDQ0NDQyBmbWE=

    if not HasModelLoaded(1885233650) then
        RequestModel(1885233650)
        return
    end
    
    local min, max = GetModelDimensions(1885233650)
    if min == vector3(0.0, 0.0, 0.0) or max == vector3(0.0, 0.0, 0.0) then
        return
    end

    local offsetMin = #(min - vector3(-0.6095175, -0.25, -1.3))
    local offsetMax = #(max - vector3(0.6099811, 0.25, 0.945))

    if offsetMin > 0.01 or offsetMax > 0.01 then
        CoreAC.DetectPlayer(CoreAC.Detections.ANTI_HITBOX_MODIFIER, {
            offsetMin = offsetMin,
            offsetMax = offsetMax,
        })
        return
    end
end)

CoreAC.RegisterDetection("hitbox", checkHitbox, 10000)