(() => {
  const parts = [
    "js/app/modules/core-data.jsx",
    "js/app/modules/ui-feedback.jsx",
    "js/app/modules/ui-inputs.jsx",
    "js/app/modules/ui-workout-sections.jsx",
    "js/app/modules/ui-sync-history.jsx",
    "js/app/modules/domain-block-planning.jsx",
    "js/app/modules/app-controller.jsx",
    "js/app/modules/app-menu-and-data.jsx",
    "js/app/modules/app-main-view.jsx",
  ];

  Promise.all(parts.map((p) => fetch(p).then((r) => r.text())))
    .then((chunks) => chunks.join("\n"))
    .then((source) => {
      const compiled = Babel.transform(source, {
        filename: "app.jsx",
        presets: [[Babel.availablePresets.react, { runtime: "classic" }]],
      }).code;
      const script = document.createElement("script");
      script.text = compiled;
      document.body.appendChild(script);
    })
    .catch((err) => console.error("Failed to load app parts", err));
})();
