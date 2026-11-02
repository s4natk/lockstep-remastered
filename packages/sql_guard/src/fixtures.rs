use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::classify_migration;

fn migrations_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../eval/migrations")
}

#[test]
fn labeled_migrations_match_hazard_codes() {
    let dir = migrations_dir();
    let labels: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.join("labels.json")).unwrap()).unwrap();
    let labels = labels.as_object().unwrap();

    let sql_files: BTreeSet<String> = fs::read_dir(&dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name.ends_with(".sql"))
        .collect();

    assert!(
        sql_files.len() >= 25,
        "expected at least 25 migrations, found {}",
        sql_files.len()
    );
    assert_eq!(
        sql_files,
        labels.keys().cloned().collect::<BTreeSet<_>>(),
        "every migration file needs a label, and every label needs a file"
    );

    for (name, label) in labels {
        let sql = fs::read_to_string(dir.join(name)).unwrap();
        let parsed = classify_migration(&sql).unwrap_or_else(|err| {
            panic!("{name} failed to parse: {err}");
        });
        let expected = label["statements"].as_array().unwrap();
        assert_eq!(parsed.statements.len(), expected.len(), "{name}");

        for statement in expected {
            let index = statement["index"].as_u64().unwrap() as usize;
            let code = statement["code"].as_str().unwrap();
            let found: Vec<_> = parsed
                .hazards
                .iter()
                .filter(|hazard| hazard.statement_index == index)
                .collect();
            if code == "safe" {
                assert!(
                    found.is_empty(),
                    "{name} statement {index} was labeled safe but emitted {found:?}"
                );
            } else {
                assert!(
                    !found.is_empty(),
                    "{name} statement {index} was labeled {code} but emitted no hazard"
                );
                assert!(
                    found.iter().all(|hazard| hazard.code.as_str() == code),
                    "{name} statement {index} expected {code}, found {found:?}"
                );
            }
        }
    }
}

#[test]
fn hazard_json_uses_the_worker_field_names() {
    let parsed = classify_migration("DROP TABLE sessions").unwrap();
    let json = serde_json::to_value(&parsed).unwrap();
    assert_eq!(json["hazards"][0]["code"], "data_loss");
    assert_eq!(json["hazards"][0]["statementIndex"], 0);
    assert!(json["hazards"][0].get("statement_index").is_none());
}
