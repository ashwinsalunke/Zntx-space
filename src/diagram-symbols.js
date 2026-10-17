import {
  Sun,
  Leaf,
  Droplets,
  Wind,
  Zap,
  Atom,
  Dna,
  FlaskConical,
  CircleDot,
} from "lucide-react";
export function symbolFor(label) {
  if (/sun|solar|photon|light energy/i.test(label)) return Sun;
  if (/water|h2o|h₂o/i.test(label)) return Droplets;
  if (/chloroplast|leaf|plant|photosynth/i.test(label)) return Leaf;
  if (/oxygen|carbon dioxide|gas|co2|co₂|o₂/i.test(label)) return Wind;
  if (/atp|nadph|energy|electron/i.test(label)) return Zap;
  if (/dna|rna|gene|protein/i.test(label)) return Dna;
  if (/reaction|cycle|synthesis|chemical/i.test(label)) return FlaskConical;
  if (/glucose|molecule|carbon|sugar/i.test(label)) return Atom;
  return CircleDot;
}
