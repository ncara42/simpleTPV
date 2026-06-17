//! Modelos de familias de producto (#154, Fase 4). Árbol jerárquico:
//! familia/subfamilia (puede anidar) o arquetipo (hoja de clasificación, solo
//! productos). Port de `ProductFamily` + `FamilyNode`.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

/// Fila plana de `ProductFamily` (paridad Prisma en la salida JSON).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductFamily {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub is_archetype: bool,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub updated_at: PrimitiveDateTime,
}

/// Nodo del árbol: la familia más sus hijos resueltos en memoria. `children` se
/// serializa junto a los campos planos de la familia (igual que el `&` de TS).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyNode {
    #[serde(flatten)]
    pub family: ProductFamily,
    pub children: Vec<FamilyNode>,
}

/// Construye el bosque a partir de filas ya ordenadas (sortOrder, name). Un nodo
/// cuyo `parentId` no existe en el conjunto se trata como raíz (paridad TS).
pub fn build_tree(rows: Vec<ProductFamily>) -> Vec<FamilyNode> {
    let ids: HashSet<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut children_of: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    let mut roots: Vec<Uuid> = Vec::new();
    let mut by_id: HashMap<Uuid, ProductFamily> = HashMap::new();
    for r in rows {
        match r.parent_id {
            Some(p) if ids.contains(&p) => children_of.entry(p).or_default().push(r.id),
            _ => roots.push(r.id),
        }
        by_id.insert(r.id, r);
    }
    roots
        .into_iter()
        .map(|id| build_node(id, &mut by_id, &children_of))
        .collect()
}

fn build_node(
    id: Uuid,
    by_id: &mut HashMap<Uuid, ProductFamily>,
    children_of: &HashMap<Uuid, Vec<Uuid>>,
) -> FamilyNode {
    let family = by_id.remove(&id).expect("nodo presente en el mapa");
    let children = children_of
        .get(&id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|c| build_node(c, by_id, children_of))
        .collect();
    FamilyNode { family, children }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn fam(id: u8, parent: Option<u8>, order: i32) -> ProductFamily {
        let u = |n: u8| Uuid::from_u128(n as u128);
        ProductFamily {
            id: u(id),
            organization_id: u(200),
            parent_id: parent.map(u),
            name: format!("F{id}"),
            color: None,
            icon: None,
            sort_order: order,
            is_archetype: false,
            created_at: datetime!(2026-01-01 0:00),
            updated_at: datetime!(2026-01-01 0:00),
        }
    }

    #[test]
    fn build_tree_anida_hijos_y_preserva_orden() {
        // 1 (raíz) → [2, 3]; 3 → [4]; 5 raíz huérfana (parent inexistente).
        let rows = vec![
            fam(1, None, 0),
            fam(2, Some(1), 0),
            fam(3, Some(1), 1),
            fam(4, Some(3), 0),
            fam(5, Some(99), 0),
        ];
        let tree = build_tree(rows);
        assert_eq!(tree.len(), 2); // raíz 1 y huérfana 5
        let root = &tree[0];
        assert_eq!(root.family.id, Uuid::from_u128(1));
        assert_eq!(root.children.len(), 2);
        assert_eq!(root.children[0].family.id, Uuid::from_u128(2));
        assert_eq!(root.children[1].family.id, Uuid::from_u128(3));
        assert_eq!(root.children[1].children[0].family.id, Uuid::from_u128(4));
    }
}
