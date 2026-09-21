import * as React from 'react'
import { ModulePanel, OverviewPanel, type ModuleCard, type ShipOverview } from './panels'
import { SaveFrame, ScreenHeader } from './shell'

const SHIP: ShipOverview = {
  "name": "Gladiator",
  "influence": 180,
  "price": 30190240,
  "purpose": "Combat",
  "specs": [
    ["Hull", 540],
    ["Armour Hardness", 65],
    ["Shields", 208],
    ["Speed", 204],
    ["Steering", 4],
    ["Fighters", 0]
  ],
  "core": [
    ["Power Plant", 6, "6E"],
    ["Power Distributor", 6, "6E"],
    ["Warp Drive", 5, "5E"],
    ["Life Support", 5, "5E"],
    ["Fuel Tank", 4, "4C"],
    ["Thrusters", 6, "6E"],
    ["Sensors", 4, "4E"]
  ],
  "optional": [
    ["Weapon", 1, "1D Pulse Laser"],
    ["Weapon", 1, "1D Pulse Laser"],
    ["Weapon", 1, "Empty"],
    ["Weapon", 2, "Empty"],
    ["Weapon", 2, "Empty"],
    ["Weapon", 2, "Empty"],
    ["Weapon", 3, "Empty"],
    ["External", 1, "Empty"],
    ["External", 1, "Empty"],
    ["External", 1, "Empty"],
    ["External", 1, "Empty"],
    ["Optional", 1, "Empty"],
    ["Optional", 2, "Empty"],
    ["Optional", 2, "Empty"],
    ["Optional", 3, "Empty"],
    ["Optional", 3, "Empty"],
    ["Military", 4, "Empty"],
    ["Military", 4, "Empty"],
    ["Military", 4, "Empty"],
    ["Optional", 4, "4D Cargo Rack"],
    ["Optional", 4, "Empty"],
    ["Optional", 4, "Empty"],
    ["Optional", 6, "6E Shields"],
    ["Optional", 6, "Empty"]
  ],
  "icon": "ship_goliath.svg",
  "sold": true,
  "faction": "Trade Federation"
}

const MODULE: ModuleCard = {
  "title": "Power Plant",
  "icon": "PowerPlant.svg",
  "description": "Produces energy which is then consumed by all the spacecraft modules.",
  "default": "2D",
  "variants": {
    "2E": {
      "rows": [
        ["Type", "[2E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "2,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "2.5 T"],
        ["Power capacity", "6.5 MW"]
      ]
    },
    "2D": {
      "rows": [
        ["Type", "[2D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "6,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "1 T"],
        ["Power capacity", "7.3 MW"]
      ]
    },
    "2C": {
      "rows": [
        ["Type", "[2C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "17,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "1.3 T"],
        ["Power capacity", "8.1 MW"]
      ]
    },
    "2B": {
      "rows": [
        ["Type", "[2B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "53,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "2 T"],
        ["Power capacity", "8.9 MW"]
      ]
    },
    "2A": {
      "rows": [
        ["Type", "[2A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "160,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "1.3 T"],
        ["Power capacity", "9.7 MW"]
      ]
    },
    "3E": {
      "rows": [
        ["Type", "[3E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "6,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "5 T"],
        ["Power capacity", "8 MW"]
      ]
    },
    "3D": {
      "rows": [
        ["Type", "[3D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "17,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "2 T"],
        ["Power capacity", "9 MW"]
      ]
    },
    "3C": {
      "rows": [
        ["Type", "[3C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "53,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "2.5 T"],
        ["Power capacity", "10 MW"]
      ]
    },
    "3B": {
      "rows": [
        ["Type", "[3B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "160,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "4 T"],
        ["Power capacity", "11 MW"]
      ]
    },
    "3A": {
      "rows": [
        ["Type", "[3A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "480,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "2.5 T"],
        ["Power capacity", "12 MW"]
      ]
    },
    "4E": {
      "rows": [
        ["Type", "[4E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "17,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "10 T"],
        ["Power capacity", "10.4 MW"]
      ]
    },
    "4D": {
      "rows": [
        ["Type", "[4D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "53,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "4 T"],
        ["Power capacity", "11.7 MW"]
      ]
    },
    "4C": {
      "rows": [
        ["Type", "[4C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "160,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "5 T"],
        ["Power capacity", "13 MW"]
      ]
    },
    "4B": {
      "rows": [
        ["Type", "[4B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "480,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "8 T"],
        ["Power capacity", "14.3 MW"]
      ]
    },
    "4A": {
      "rows": [
        ["Type", "[4A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "1,420,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "5 T"],
        ["Power capacity", "15.6 MW"]
      ]
    },
    "5E": {
      "rows": [
        ["Type", "[5E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "53,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "20 T"],
        ["Power capacity", "13.6 MW"]
      ]
    },
    "5D": {
      "rows": [
        ["Type", "[5D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "160,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "8 T"],
        ["Power capacity", "15.3 MW"]
      ]
    },
    "5C": {
      "rows": [
        ["Type", "[5C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "480,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "10 T"],
        ["Power capacity", "17 MW"]
      ]
    },
    "5B": {
      "rows": [
        ["Type", "[5B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "1,440,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "16 T"],
        ["Power capacity", "18.7 MW"]
      ]
    },
    "5A": {
      "rows": [
        ["Type", "[5A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "4,320,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "10 T"],
        ["Power capacity", "20.4 MW"]
      ]
    },
    "6E": {
      "rows": [
        ["Type", "[6E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "160,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "40 T"],
        ["Power capacity", "16.8 MW"]
      ]
    },
    "6D": {
      "rows": [
        ["Type", "[6D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "480,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "16 T"],
        ["Power capacity", "18.9 MW"]
      ]
    },
    "6C": {
      "rows": [
        ["Type", "[6C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "1,442,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "20 T"],
        ["Power capacity", "21 MW"]
      ]
    },
    "6B": {
      "rows": [
        ["Type", "[6B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "4,323,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "32 T"],
        ["Power capacity", "23.1 MW"]
      ]
    },
    "6A": {
      "rows": [
        ["Type", "[6A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "12,600,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "20 T"],
        ["Power capacity", "25.2 MW"]
      ]
    },
    "7E": {
      "rows": [
        ["Type", "[7E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "468,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "80 T"],
        ["Power capacity", "20 MW"]
      ]
    },
    "7D": {
      "rows": [
        ["Type", "[7D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "1,406,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "32 T"],
        ["Power capacity", "22.5 MW"]
      ]
    },
    "7C": {
      "rows": [
        ["Type", "[7C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "4,216,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "40 T"],
        ["Power capacity", "25 MW"]
      ]
    },
    "7B": {
      "rows": [
        ["Type", "[7B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "13,000,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "64 T"],
        ["Power capacity", "27.5 MW"]
      ]
    },
    "7A": {
      "rows": [
        ["Type", "[7A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "38,000,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "40 T"],
        ["Power capacity", "30 MW"]
      ]
    },
    "8E": {
      "rows": [
        ["Type", "[8E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "1,402,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "160 T"],
        ["Power capacity", "24 MW"]
      ]
    },
    "8D": {
      "rows": [
        ["Type", "[8D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "4,216,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "64 T"],
        ["Power capacity", "27 MW"]
      ]
    },
    "8C": {
      "rows": [
        ["Type", "[8C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "12,640,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "80 T"],
        ["Power capacity", "30 MW"]
      ]
    },
    "8B": {
      "rows": [
        ["Type", "[8B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "38,000,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "128 T"],
        ["Power capacity", "33 MW"]
      ]
    },
    "8A": {
      "rows": [
        ["Type", "[8A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "162,000,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "80 T"],
        ["Power capacity", "36 MW"]
      ]
    },
    "9E": {
      "rows": [
        ["Type", "[9E] Power Plant"],
        ["Durability", "100%"],
        ["Price", "4,216,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "320 T"],
        ["Power capacity", "28 MW"]
      ]
    },
    "9D": {
      "rows": [
        ["Type", "[9D] Power Plant"],
        ["Durability", "100%"],
        ["Price", "12,890,000 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "128 T"],
        ["Power capacity", "33 MW"]
      ]
    },
    "9C": {
      "rows": [
        ["Type", "[9C] Power Plant"],
        ["Durability", "100%"],
        ["Price", "41,700,460 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "160 T"],
        ["Power capacity", "38 MW"]
      ]
    },
    "9B": {
      "rows": [
        ["Type", "[9B] Power Plant"],
        ["Durability", "100%"],
        ["Price", "163,200,900 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "256 T"],
        ["Power capacity", "43 MW"]
      ]
    },
    "9A": {
      "rows": [
        ["Type", "[9A] Power Plant"],
        ["Durability", "100%"],
        ["Price", "272,490,250 CR"]
      ],
      "params": [
        ["Power use", "0 MW"],
        ["Mass", "160 T"],
        ["Power capacity", "48 MW"]
      ]
    }
  }
}

/** Renders the two panels against their screenshots; the real screens read the loaded save. */
export default function PanelDemoPage() {
  const [view, setView] = React.useState<'ship' | 'module'>('ship')
  const [grade, setGrade] = React.useState(MODULE.default)
  return (
    <SaveFrame>
      <ScreenHeader
        title={view === 'ship' ? 'Ship Overview' : 'Available Modules'}
        onReturn={() => setView(view === 'ship' ? 'module' : 'ship')}
      />
      <div className="ggbody">
        {view === 'ship'
          ? <OverviewPanel ship={SHIP} />
          : <ModulePanel card={MODULE} grade={grade} onGrade={setGrade} />}
      </div>
    </SaveFrame>
  )
}
