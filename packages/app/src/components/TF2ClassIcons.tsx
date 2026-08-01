import { For } from "solid-js";
import scoutIcon from "../assets/images/tf2/classes/scout.png";
import soldierIcon from "../assets/images/tf2/classes/soldier.png";
import pyroIcon from "../assets/images/tf2/classes/pyro.png";
import demomanIcon from "../assets/images/tf2/classes/demoman.png";
import heavyIcon from "../assets/images/tf2/classes/heavy.png";
import engineerIcon from "../assets/images/tf2/classes/engineer.png";
import medicIcon from "../assets/images/tf2/classes/medic.png";
import sniperIcon from "../assets/images/tf2/classes/sniper.png";
import spyIcon from "../assets/images/tf2/classes/spy.png";

const classIcons: Record<string, string> = {
  scout: scoutIcon,
  soldier: soldierIcon,
  pyro: pyroIcon,
  demoman: demomanIcon,
  demo: demomanIcon,
  heavy: heavyIcon,
  heavyweapons: heavyIcon,
  engineer: engineerIcon,
  medic: medicIcon,
  sniper: sniperIcon,
  spy: spyIcon,
};

export function TF2ClassIcons(props: { classes: string[] }) {
  const entries = () =>
    props.classes.flatMap((name) => {
      const icon = classIcons[name.toLowerCase().replace(/[^a-z]/g, "")];
      return icon ? [{ name, icon }] : [];
    });
  return (
    <div class="mt-1 flex flex-wrap gap-1.5">
      <For each={entries()}>
        {(entry) => (
          <img
            class="h-7 w-7 rounded border border-slate-700 bg-slate-950 object-contain p-0.5"
            src={entry.icon}
            alt={entry.name}
            title={entry.name}
          />
        )}
      </For>
    </div>
  );
}
