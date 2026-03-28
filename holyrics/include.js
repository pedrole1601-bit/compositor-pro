/**
 * Holyrics Include Script - Compositor Pro v2
 * Este código deve ser colado no Include do Holyrics (Menu Ferramentas -> JavaScript -> Include).
 * NOTA: Usar sintaxe ES5 (sem arrow functions, sem const/let, sem template literals).
 */

var COMPOSITOR_URL = "http://localhost:3000";
var COMPOSITOR_PIN = "1234";

function notifyCompositor(event, data) {
    var body = JSON.stringify({
        event: event,
        data: data
    });
    
    h.httpRequest(COMPOSITOR_URL + "/api/holyrics/event", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Auth-Pin": COMPOSITOR_PIN
        },
        body: body
    });
}

// Gatilho: Mudança de Slide
h.addTriggerListener("slide_change", function(data) {
    h.log("Slide alterado no Holyrics");
    notifyCompositor("slide_change", data);
});

// Gatilho: Início de Apresentação
h.addTriggerListener("presentation_start", function(data) {
    h.log("Apresentação iniciada: " + data.name);
    notifyCompositor("presentation_start", data);
});

// Gatilho: Mídia reproduzida
h.addTriggerListener("media_play", function(data) {
    h.log("Mídia em execução: " + data.file_name);
    notifyCompositor("media_play", data);
});

h.log("Compositor Pro v2 - Include carregado com sucesso!");
