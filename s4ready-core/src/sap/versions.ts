/**
 * SAP version & system-type identifiers. Used throughout to gate tools to
 * the right systems and to drive adapter selection.
 */

export type SapSystemType =
  | 's4hana_cloud_public'
  | 's4hana_cloud_private'
  | 's4hana_on_prem'
  | 'ecc';

export type SapVersion =
  | 's4hana_cloud_public'
  | 's4hana_cloud_private'
  | 's4hana_on_prem_2023'
  | 's4hana_on_prem_2022'
  | 's4hana_on_prem_2021'
  | 's4hana_on_prem_2020'
  | 's4hana_on_prem_1909'
  | 's4hana_on_prem_1809'
  | 'ecc_6_ehp8'
  | 'ecc_6_ehp7'
  | 'ecc_6_ehp6_or_older';

export const SAP_VERSIONS_ALL: SapVersion[] = [
  's4hana_cloud_public',
  's4hana_cloud_private',
  's4hana_on_prem_2023',
  's4hana_on_prem_2022',
  's4hana_on_prem_2021',
  's4hana_on_prem_2020',
  's4hana_on_prem_1909',
  's4hana_on_prem_1809',
  'ecc_6_ehp8',
  'ecc_6_ehp7',
  'ecc_6_ehp6_or_older'
];

export const SAP_VERSIONS_S4_ONLY: SapVersion[] = [
  's4hana_cloud_public',
  's4hana_cloud_private',
  's4hana_on_prem_2023',
  's4hana_on_prem_2022',
  's4hana_on_prem_2021',
  's4hana_on_prem_2020',
  's4hana_on_prem_1909',
  's4hana_on_prem_1809'
];

export const SAP_VERSIONS_S4_MODERN: SapVersion[] = [
  's4hana_cloud_public',
  's4hana_cloud_private',
  's4hana_on_prem_2023',
  's4hana_on_prem_2022',
  's4hana_on_prem_2021',
  's4hana_on_prem_2020'
];

export function isS4HanaVersion(version: SapVersion): boolean {
  return version.startsWith('s4hana_');
}

export function isEccVersion(version: SapVersion): boolean {
  return version.startsWith('ecc_');
}

export function systemTypeToVersions(type: SapSystemType): SapVersion[] {
  switch (type) {
    case 's4hana_cloud_public':
      return ['s4hana_cloud_public'];
    case 's4hana_cloud_private':
      return ['s4hana_cloud_private'];
    case 's4hana_on_prem':
      return [
        's4hana_on_prem_2023',
        's4hana_on_prem_2022',
        's4hana_on_prem_2021',
        's4hana_on_prem_2020',
        's4hana_on_prem_1909',
        's4hana_on_prem_1809'
      ];
    case 'ecc':
      return ['ecc_6_ehp8', 'ecc_6_ehp7', 'ecc_6_ehp6_or_older'];
  }
}
