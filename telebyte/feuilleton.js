// Le feuilleton d'Arno et Mila (07/11/2026) : un texte suivi, lu une ou deux répliques à la fois dans les temps calmes,
// avant le départ (AVANT) et pendant la course (PENDANT). Chaque joueur reprend là où il s'était arrêté (narrator.js,
// mémorisé sur l'appareil) ; à la fin, on reprend au début. Texte fixe : chaque réplique n'est lue qu'une fois par
// ElevenLabs, pour tous les joueurs et toutes les courses.
// Un échange = [[qui, texte], …] ; A : Arno Vasseur (le commentateur), B : Mila Korsh (la consultante, ancienne pilote).
// Le texte ne cite ni l'heure, ni le parcours du jour, ni le classement : il vaut pour toutes les éditions.

export const AVANT = [
  // ── ouverture ──
  [['A', "Bonsoir à toutes et à tous, et bienvenue sur le Télébyte ! Ici Arno Vasseur, en direct de la cabine de la Grande Fronde !"], ['B', "Et Mila Korsh à ses côtés. Ancienne pilote, actuelle voisine de bureau d'Arno. Je ne sais pas laquelle des deux carrières est la plus dangereuse."]],
  [['A', "Mila, on a toute la journée devant nous avant le départ. Qu'est-ce qu'on raconte aux commandants ?"], ['B', "Tout. Les règles, les pilotes, les coulisses, et quelques secrets que la direction de course préférerait garder pour elle."]],
  [['A', "Des secrets ? Je sens que je vais adorer cette journée !"], ['B', "Tu adores toutes les journées, Arno. C'est ton principal défaut, et ta seule qualité."]],
  // ── les règles ──
  [['A', "Commençons par le commencement. La Grande Fronde, c'est quoi, en une phrase ?"], ['B', "Quatre vaisseaux, une dizaine de systèmes, et une seule idée : voler l'énergie des planètes géantes pour aller plus vite que tout le monde."]],
  [['A', "Voler l'énergie des planètes ? C'est légal, ça ?"], ['B', "Parfaitement légal. Ça s'appelle une fronde gravitationnelle. Tu plonges vers la géante, elle t'attire, et tu repars plus vite que tu n'es arrivé."]],
  [['A', "Comme une balançoire cosmique !"], ['B', "Voilà. Sauf qu'une balançoire ne fait pas fondre ta coque si tu passes trop près."]],
  [['A', "Et c'est là qu'intervient le fameux effet Oberth, dont tout le monde parle sans le comprendre."], ['B', "C'est simple : une poussée de moteur rapporte beaucoup plus quand tu vas déjà très vite. Donc on pousse au point le plus bas, au ras de la planète."]],
  [['A', "Au ras de la planète, là où il fait le plus chaud…"], ['B', "Là où il fait le plus chaud, là où on a le plus peur, et là où on gagne la course. C'est toute la beauté du sport."]],
  [['A', "Et entre les systèmes, il se passe quoi ?"], ['B', "Le grand vide. Des heures de croisière. Plus tu sors vite d'un système, plus ton étape est courte. Tout se joue à la sortie."]],
  [['A', "Les pilotes choisissent leur trajectoire à chaque système, c'est bien ça ?"], ['B', "À chaque entrée. Prudente, classique, ou plongée rasante. Et une fois annoncée, on ne revient pas en arrière. C'est publié, gravé, assumé."]],
  [['A', "Et nous, en cabine, on découvre leurs choix en même temps que vous, commandants !"], ['B', "Ce qui explique les cris d'Arno. Je m'excuse d'avance auprès de vos oreilles."]],
  // ── Ysée Marr, la Sentinelle ──
  [['A', "Passons aux pilotes ! On commence par la commandante Ysée Marr, aux commandes de la Sentinelle."], ['B', "Ysée, c'est la régularité incarnée. Elle ne fait jamais le coup d'éclat, mais elle est toujours là au moment où il faut."]],
  [['A', "Tu l'as connue en course, Mila ?"], ['B', "On a couru trois saisons ensemble. Elle me battait une fois sur deux. L'autre fois, je trichais un peu sur le carburant."]],
  [['A', "Mila Korsh, en direct, avoue des tricheries !"], ['B', "J'avoue des économies. Nuance. La direction de course a classé l'affaire."]],
  [['A', "Son vaisseau, le Racer 07, a une drôle d'allure. Deux réacteurs tout au bout des ailes !"], ['B', "C'est pour l'équilibre dans les plongées. Les réacteurs écartés, le vaisseau ne part pas en toupie quand la géante tire dessus."]],
  [['A', "On dit qu'Ysée écoute toujours la même chanson avant chaque départ."], ['B', "Une berceuse de sa planète natale. Elle dit que ça la calme. Son équipage dit que ça les endort."]],
  [['A', "Son point faible ?"], ['B', "Elle est trop raisonnable. Quand tout le monde prend des risques, elle reste sage. Et parfois, la sagesse arrive deuxième."]],
  // ── Brannoc, le Kerath Lourd ──
  [['A', "Deuxième pilote : le vieux Brannoc et son Kerath Lourd. Le doyen de la course !"], ['B', "Brannoc a couru sa première Fronde avant qu'Arno sache parler. Ce qui, vu le résultat, était une période plus calme."]],
  [['A', "Merci, Mila. Son vaisseau, le Monoreactor 88, ne fait que quatorze mètres de long !"], ['B', "Quatorze mètres, et un seul réacteur, énorme. C'est un poing fermé avec un moteur au bout."]],
  [['A', "Et il encaisse tout, paraît-il."], ['B', "Tout. Les débris, la chaleur, les astéroïdes. Brannoc dit que son vaisseau est comme lui : petit, vieux, et impossible à casser."]],
  [['A', "Sa stratégie, c'est quoi ?"], ['B', "Passer large, pousser fort, et attendre que les autres fassent des bêtises. Et dans la Fronde, les autres font toujours des bêtises."]],
  [['A', "Brannoc a une superstition célèbre, il me semble."], ['B', "Il garde une boîte de biscuits à bord. Il ne l'ouvre jamais. Il dit que le jour où il l'ouvrira, ce sera pour fêter sa dernière victoire."]],
  [['A', "Et elle est ouverte depuis combien de temps, cette boîte ?"], ['B', "Personne ne sait. Les biscuits doivent être plus vieux que certains spectateurs."]],
  // ── Tobbe, La Mule ──
  [['A', "Troisième pilote : Tobbe le docker, aux commandes de La Mule ! Le chouchou des tribunes !"], ['B', "Tobbe chargeait des cargos au Comptoir il y a quelques années. Un jour, il a acheté un vieux Bidon 52 et il s'est inscrit à la course."]],
  [['A', "Un ancien docker dans la Grande Fronde ? Ça a dû faire rire tout le monde !"], ['B', "Tout le monde a ri. Jusqu'à ce qu'il termine sur le podium. Depuis, plus personne ne rit de La Mule."]],
  [['A', "Le Bidon 52, c'est un vrai cargo à la base ?"], ['B', "Un cargo de livraison, avec quatre nacelles motrices. Peu de poussée, mais une vitesse de croisière que personne n'arrive à suivre entre les étoiles."]],
  [['A', "Donc La Mule perd du temps dans les systèmes, et en regagne entre eux."], ['B', "Exactement. C'est une course de fond pour elle. Plus la course est longue, plus elle est dangereuse."]],
  [['A', "Et on m'a dit que Tobbe parle à son vaisseau ?"], ['B', "Il l'appelle « ma grande ». Il lui dit merci à chaque sortie de système. Franchement, vu ce qu'il lui demande, c'est la moindre des choses."]],
  [['A', "Il a aussi un fan-club, non ?"], ['B', "Les dockers du Comptoir. Ils portent des casques verts et chantent à chaque passage. Ils chantent faux, mais avec beaucoup de cœur."]],
  // ── Kaï Varon, le Fulgurant ──
  [['A', "Et enfin, le plus spectaculaire : Kaï Varon et le Fulgurant !"], ['B', "Kaï, c'est le pilote que les mamans détestent et que les enfants adorent."]],
  [['A', "Il plonge plus près des géantes que n'importe qui, c'est vrai ?"], ['B', "Plus près que n'importe qui de sensé. Il vise la limite à chaque fois. Parfois, il la dépasse."]],
  [['A', "Son vaisseau, le Fulgur 07, fait cent mètres de long. Une flèche jaune !"], ['B', "Une flèche magnifique, avec une coque fine comme du papier. Quand ça chauffe, ça chauffe vraiment."]],
  [['A', "Pourquoi prendre autant de risques ?"], ['B', "Parce que quand ça passe, il ressort comme une comète et personne ne le revoit avant l'arrivée. Kaï préfère gagner en grand que finir en petit."]],
  [['A', "On dit qu'il ne mange rien avant une plongée."], ['B', "Rien. Il dit que ça lui donne les idées claires. Moi, à jeun, j'aurais surtout les idées noires."]],
  [['A', "Tu crois qu'il a peur, parfois ?"], ['B', "Tout le monde a peur. Kaï, lui, a simplement décidé que la peur pouvait attendre la fin de la course."]],
  // ── Mila raconte sa dernière course ──
  [['A', "Mila, tu ne racontes jamais ta dernière course. Aujourd'hui, c'est le moment !"], ['B', "Tu insistes depuis trois ans. Bon. C'était il y a six saisons, dans un système qui n'existe plus sur la carte des courses."]],
  [['A', "Un système qui n'existe plus ? Raconte !"], ['B', "Ses anneaux étaient trop instables. Trop de débris. Après ma course, la direction l'a retiré du parcours. Je ne suis pas étrangère à cette décision."]],
  [['A', "Qu'est-ce qui s'est passé ?"], ['B', "J'étais deuxième. J'ai tenté de couper par les anneaux pour passer en tête. Le raccourci de ma vie."]],
  [['A', "Et alors ?"], ['B', "Et alors, un caillou de la taille d'un piano a décidé de traverser mon cockpit. J'ai fini la course avec un trou dans la coque et une très mauvaise humeur."]],
  [['A', "Tu as fini la course ?!"], ['B', "Troisième. Avec un scaphandre, un rouleau de ruban adhésif et beaucoup de vocabulaire. Le lendemain, j'ai rangé mes gants."]],
  [['A', "Et tu ne regrettes pas ?"], ['B', "Tous les jours. Mais d'ici, au moins, je peux critiquer les autres sans risquer de prendre un piano dans la figure."]],
  // ── les dix systèmes ──
  [['A', "Parlons du terrain de jeu. Une dizaine de systèmes, chacun avec sa géante. Mila, ton préféré ?"], ['B', "Kerath et sa géante ambrée. Des anneaux immenses, des lunes partout. C'est le système le plus beau, et le plus traître."]],
  [['A', "Et le plus effrayant ?"], ['B', "Nox. Une géante noire sous une étoile rouge. On n'y voit presque rien. Les pilotes plongent à l'instinct."]],
  [['A', "On m'a parlé d'Ivène, la géante braise."], ['B', "Une étoile toute proche, une géante rouge sombre qui rougeoie comme un feu de camp. Les coques y chauffent avant même la plongée."]],
  [['A', "Et Talys, la géante pâle, couchée sur le côté ?"], ['B', "Talys tourne presque à plat. Ses anneaux sont debout, comme une porte. Les pilotes disent qu'on a l'impression de plonger dans un tableau."]],
  [['A', "Il y a aussi Sarn, la géante verte."], ['B', "Sarn la jade. Elle a des orages énormes, avec des éclairs qu'on voit depuis l'espace. Magnifique, à condition de ne pas passer dedans."]],
  [['A', "Et Quell, la violette ? Ça sonne comme un nom de fleur."], ['B', "Une fleur avec des aurores autour de la tête. Quand on la frôle de nuit, le cockpit devient tout violet. Le plus beau spectacle de la course."]],
  [['A', "Ostra, la géante crème, avec ses anneaux immenses."], ['B', "Les plus larges de tout le parcours. Si tu les traverses au mauvais endroit, c'est comme rouler sur du gravier à quarante kilomètres par seconde."]],
  [['A', "Et Mirr, la cuivrée ?"], ['B', "Mirr, c'est la cocotte-minute. Une étoile rouge, une géante couleur rouille et des tempêtes partout. Personne n'aime Mirr. Tout le monde respecte Mirr."]],
  [['A', "Il nous reste Vessa et Orvane."], ['B', "Vessa la bleue, toute calme, la plus reposante du parcours. Et Orvane la rose, avec deux lunes qui jouent à cache-cache. Toujours une surprise à Orvane."]],
  // ── coulisses de la régie ──
  [['A', "Un mot sur les coulisses. Ici, en régie, on est combien pour vous faire vivre la course ?"], ['B', "Douze techniciens, trois drones caméras, un cuisinier, et un Arno. Le plus bruyant des quinze, ce n'est pas le cuisinier."]],
  [['A', "Les drones caméras suivent les vaisseaux dans les systèmes ?"], ['B', "Ils se postent près des géantes et attendent. Quand un vaisseau passe à quarante kilomètres par seconde, le drone a exactement un clignement d'œil pour faire l'image."]],
  [['A', "Et on a déjà perdu des drones ?"], ['B', "Onze l'an dernier. L'un d'eux a été retrouvé en orbite autour d'une lune. Il filme encore. On ne sait pas quoi."]],
  [['A', "Et le cuisinier, il prépare quoi pour soixante-douze heures de direct ?"], ['B', "De la soupe. Beaucoup de soupe. La soupe, c'est la seule chose qui ne flotte pas partout quand Arno saute de sa chaise."]],
  [['A', "Je ne saute pas de ma chaise !"], ['B', "Tu as cassé deux chaises la saison dernière. La régie a fini par te visser au sol."]],
  // ── les paris ──
  [['A', "Un mot pour les commandants qui veulent parier. Mila, des conseils ?"], ['B', "D'abord, ne pariez jamais ce que vous n'êtes pas prêts à perdre. La course, ça se regarde avant tout pour le plaisir."]],
  [['A', "Et ensuite ?"], ['B', "Regardez la carte des dangers : les ceintures d'astéroïdes, les risques d'éruption. Un pilote audacieux dans une course dangereuse, c'est un pari… audacieux."]],
  [['A', "Le favori n'est pas toujours le meilleur pari, c'est ça ?"], ['B', "Le favori rapporte peu, parce que tout le monde mise dessus. L'outsider rapporte gros, quand il gagne. Tout est là."]],
  [['A', "Et la course est vraiment honnête ? Rien n'est truqué ?"], ['B', "Le résultat est scellé avant l'ouverture des paris, et son empreinte est publiée. À l'arrivée, chacun peut vérifier. Même Arno n'a pas accès au résultat."]],
  [['A', "Heureusement, je l'aurais dit à tout le monde !"], ['B', "C'est exactement pour ça qu'on ne te le dit pas."]],
  // ── légendes de la Fronde ──
  [['A', "Mila, raconte-nous la première Grande Fronde. Les débuts !"], ['B', "Trois vaisseaux, deux systèmes, et un parcours tracé sur une serviette en papier par trois pilotes de cargo, un soir, au Comptoir."]],
  [['A', "Sur une serviette en papier ?"], ['B', "Elle est encadrée dans le bureau de la direction de course. Avec une tache de sauce dessus. La tache fait partie de l'histoire."]],
  [['A', "Et qui a gagné cette première course ?"], ['B', "Personne ne s'en souvient vraiment. Les trois pilotes prétendent tous avoir gagné. Ils racontent encore l'histoire, chacun la sienne."]],
  [['A', "Et la légende du vaisseau fantôme ? Tu y crois ?"], ['B', "Ah, le cinquième vaisseau. Certains pilotes jurent avoir vu une lueur sans immatriculation les dépasser dans le grand vide."]],
  [['A', "Un vaisseau fantôme dans la course ? Ça me donne des frissons !"], ['B', "Moi, je pense que c'est un reflet sur la verrière. Mais je l'ai vu deux fois. Et je n'avais pas mangé de soupe ce jour-là."]],
  [['A', "Il y a aussi la légende de la plongée parfaite."], ['B', "La trajectoire idéale, celle qui frôle la géante au millimètre près, sans une égratignure. On dit qu'un seul pilote l'a réussie. Personne ne sait qui."]],
  [['A', "Kaï Varon la cherche, non ?"], ['B', "Kaï la cherche à chaque plongée. C'est pour ça que son mécanicien a les cheveux blancs à trente ans."]],
  // ── rumeurs du paddock ──
  [['A', "Passons aux rumeurs du paddock ! On dit que Brannoc a changé son réacteur cette saison."], ['B', "On dit ça chaque saison. Et chaque saison, c'est le même réacteur, simplement mieux astiqué."]],
  [['A', "Il paraît qu'Ysée Marr a un nouveau navigateur."], ['B', "Un jeune très doué, qui ne parle jamais. Ysée dit que c'est le meilleur équipier de sa vie. Il ne l'a pas encore contredite."]],
  [['A', "Et Tobbe aurait repeint sa Mule pendant la nuit ?"], ['B', "Il a repeint le chiffre cinquante-deux. Il dit que ça porte bonheur. Les dockers disent que ça cachait surtout une rayure."]],
  [['A', "Et la grande rumeur : Kaï Varon aurait parié sur lui-même !"], ['B', "Les pilotes n'ont pas le droit de parier. Mais je suis prête à parier qu'il en a très envie."]],
  // ── les commandants ──
  [['A', "Un petit mot pour tous les commandants qui nous regardent depuis leur planète."], ['B', "Bonsoir à vous. Vous pouvez suivre un racer en le touchant sur la carte, et plonger dans les systèmes pour voir les passages de près."]],
  [['A', "Et si vous êtes pressés, le mode télé choisit les images pour vous !"], ['B', "C'est comme avoir un réalisateur personnel. Un réalisateur qui ne crie pas. Contrairement à certains."]],
  [['A', "Et n'oubliez pas : la fiche des racers vous montre les vaisseaux sous toutes les coutures."], ['B', "Allez y faire un tour avant de parier. Un vaisseau, ça se regarde dans les yeux. Enfin, dans les hublots."]],
  // ── montée en pression ──
  [['A', "Mila, plus on approche du départ, plus je sens la tension monter."], ['B', "Dans les hangars, les mécaniciens resserrent tout ce qui se resserre. Et quelques trucs qui ne se resserrent pas."]],
  [['A', "À quoi pensent les pilotes, juste avant le départ ?"], ['B', "Au premier système. Pas à la victoire, pas à l'arrivée. Juste au premier passage. Une course, ça se gagne une géante à la fois."]],
  [['A', "Et toi, à quoi tu pensais, avant tes départs ?"], ['B', "Au café que je ne boirais pas pendant soixante-douze heures. Et à ma mère, qui regardait. Dans cet ordre-là, je l'avoue."]],
  [['A', "Un dernier pronostic avant le départ ?"], ['B', "Il va y avoir des dépassements, des plongées folles, au moins une surprise, et Arno va hurler. Je prends tous les paris là-dessus."]],
  [['A', "Restez avec nous, commandants : la Grande Fronde, c'est bientôt, et c'est ici !"], ['B', "Installez-vous confortablement. Prenez de la soupe. Et attachez vos ceintures."]],
];

export const PENDANT = [
  // ── le carnet de bord de Mila ──
  [['A', "Pendant que nos pilotes filent, Mila, raconte-nous la vie à bord pendant soixante-douze heures."], ['B', "On dort par tranches de vingt minutes, on mange des barres qui ont le goût de carton, et on parle tout seul. Beaucoup."]],
  [['A', "On parle tout seul ?"], ['B', "Au vaisseau, aux moteurs, à la géante qui approche. Le silence du grand vide, au bout de vingt heures, ça pèse sur les épaules."]],
  [['A', "Et la nuit, à bord ?"], ['B', "Il n'y a pas de nuit, il n'y a que les étoiles. Pour dormir, on éteint le cockpit et on garde juste une petite lumière rouge."]],
  [['A', "Et la toilette ?"], ['B', "Arno, il y a des enfants qui écoutent. Disons simplement que c'est une aventure en soi."]],
  [['A', "Qu'est-ce qui te manquait le plus, en course ?"], ['B', "Le bruit de la pluie. Dans l'espace, il ne pleut jamais. Et étrangement, c'est ce qui manque le plus."]],
  // ── la fronde expliquée ──
  [['A', "Petite leçon de pilotage pour les commandants. Mila, pourquoi entrer lentement dans un système pour plonger ?"], ['B', "Plus tu arrives lentement, plus la géante a le temps de te courber la trajectoire. Tu descends plus bas, et tu repars beaucoup plus vite."]],
  [['A', "Donc ralentir pour aller plus vite. C'est un peu fou !"], ['B', "C'est la règle numéro un de la Fronde. Celle que personne ne croit avant de l'avoir vécue."]],
  [['A', "Et les lunes, elles servent à quoi ?"], ['B', "À voler encore un peu de vitesse avant la géante. Une petite fronde avant la grande. Mais une lune, ça a des débris autour. Il faut viser juste."]],
  [['A', "Et la chaleur, pendant une plongée, c'est vraiment terrible ?"], ['B', "Au plus près, la haute atmosphère de la géante frotte sur la coque. Les capteurs passent au rouge, la verrière se teinte. On serre les dents."]],
  [['A', "Et si on passe trop près ?"], ['B', "Surchauffe. L'ordinateur coupe la poussée pour sauver le vaisseau. Tu perds ta plongée, et souvent ta course avec."]],
  [['A', "Et le carburant, comment on le gère sur toute la course ?"], ['B', "On garde toujours de quoi finir. Un pilote à sec, c'est un pilote qui regarde les autres passer en mangeant sa barre au carton."]],
  // ── histoires des systèmes ──
  [['A', "Une petite histoire de système, Mila ? Parle-nous des lunes de Kerath."], ['B', "Oro la volcanique crache des panaches de soufre. Les pilotes disent que ça sent l'œuf pourri jusque dans le cockpit. C'est faux, mais tout le monde le dit."]],
  [['A', "Et Nox, il paraît qu'il y a un écho mystérieux sur les radars ?"], ['B', "Un signal faible, qui revient toutes les dix-sept minutes. Les techniciens disent que c'est un vieux satellite. Les pilotes ne passent jamais trop près."]],
  [['A', "Ivène, la géante braise, cache aussi une histoire ?"], ['B', "On raconte qu'une expédition minière s'y est installée il y a cent ans. Ils sont repartis au bout d'une semaine. Trop chaud. Même pour des mineurs."]],
  [['A', "Et Talys, la pâle ? Pourquoi elle est couchée sur le côté ?"], ['B', "Un très vieux choc, d'après les savants. Une autre planète l'aurait percutée il y a des milliards d'années. Elle ne s'en est jamais relevée."]],
  [['A', "Sarn et ses orages verts, c'est dangereux pour les pilotes ?"], ['B', "Les éclairs de Sarn brouillent les instruments. Pendant quelques secondes, on pilote à l'œil. C'est là qu'on reconnaît les vrais pilotes."]],
  [['A', "Et Ostra, avec ses anneaux immenses ?"], ['B', "Les anneaux d'Ostra sont faits de glace. Quand le soleil les éclaire, ils brillent comme une patinoire géante. Une patinoire à quarante kilomètres par seconde."]],
  [['A', "Quell, la violette, et ses aurores…"], ['B', "Les pilotes ont une tradition : à Quell, on éteint les lumières du cockpit pendant dix secondes pour regarder les aurores. Même en pleine course."]],
  [['A', "Même Kaï Varon ?"], ['B', "Surtout Kaï Varon. C'est un casse-cou, mais c'est un poète. Les deux vont souvent ensemble."]],
  // ── les mécaniciens ──
  [['A', "Un mot pour les héros de l'ombre : les mécaniciens !"], ['B', "Ils préparent les vaisseaux pendant des semaines, et pendant la course, ils ne peuvent rien faire d'autre que regarder. C'est la pire des tortures."]],
  [['A', "Ils suivent la course comment ?"], ['B', "Sur les mêmes écrans que vous. Avec les ongles en moins à chaque plongée."]],
  [['A', "Et quand un pilote doit réparer en plein vide ?"], ['B', "Le mécanicien le guide à la radio. « Le câble rouge. Non, l'autre rouge. Non, pas celui-là. » Ça peut durer longtemps."]],
  [['A', "Le mécanicien de Brannoc est une légende, paraît-il."], ['B', "Il a quatre-vingts ans et il refuse de prendre sa retraite tant que Brannoc court. Brannoc refuse d'arrêter tant que son mécanicien travaille. Ils sont coincés."]],
  // ── records ──
  [['A', "Quelques records de la Grande Fronde, Mila ?"], ['B', "La plongée la plus basse : à peine quelques centaines de kilomètres au-dessus des nuages d'une géante. Le pilote a mis une semaine à s'en remettre."]],
  [['A', "Et l'écart le plus serré à l'arrivée ?"], ['B', "Moins d'une seconde, après soixante-douze heures de course. Les deux pilotes ont dû regarder le ralenti pour savoir qui avait gagné."]],
  [['A', "Et la course la plus folle ?"], ['B', "Celle où les quatre vaisseaux ont changé de place en tête dans le même système. Arno a perdu sa voix. Nous avons eu une heure de silence. Un record aussi."]],
  // ── le courrier des commandants ──
  [['A', "Place au courrier des commandants ! Premier message : « Mila, est-ce que tu reprendrais le volant un jour ? »"], ['B', "Seulement si Arno est dans le siège passager. Pour voir enfin quelqu'un de plus terrorisé que moi."]],
  [['A', "Deuxième message : « Arno, pourquoi vous criez tout le temps ? »"], ['B', "Je peux répondre ? Parce qu'il croit que les vaisseaux l'entendent."]],
  [['A', "Troisième message : « Quel vaisseau a le meilleur café à bord ? »"], ['B', "Le Kerath Lourd. Brannoc fait son café dans le système de refroidissement du réacteur. C'est interdit, et c'est délicieux."]],
  [['A', "Quatrième message : « Est-ce que les racers se parlent pendant la course ? »"], ['B', "Jamais officiellement. Mais on raconte qu'Ysée et Tobbe s'envoient des blagues par la radio de secours pendant les longues étapes."]],
  [['A', "Dernier message : « Bravo pour les commentaires, mais parlez moins fort. »"], ['B', "Ce message est pour toi, Arno. Je l'encadre."]],
  // ── les débats ──
  [['A', "Grand débat en cabine ! Mila, quel est le plus beau vaisseau de la course ?"], ['B', "Le Fulgurant, sans hésiter. Une flèche jaune. Toi, tu vas dire la Mule, parce que tu as un faible pour les causes perdues."]],
  [['A', "La Mule n'est pas une cause perdue ! C'est un vaisseau courageux !"], ['B', "Courageux et têtu. Comme son pilote. Comme toi, d'ailleurs. Ça explique ton affection."]],
  [['A', "Autre débat : vaut-il mieux être en tête tôt, ou attaquer à la fin ?"], ['B', "En tête tôt, tu prends les risques sans savoir ce que font les autres. À la fin, tu sais tout, mais il faut combler l'écart. Moi, j'attaquais toujours à la fin."]],
  [['A', "Et ça marchait ?"], ['B', "Une fois sur deux. L'autre fois, j'attaquais trop tard et je racontais à tout le monde que c'était voulu."]],
  [['A', "Dernier débat : les lunes, une bénédiction ou un piège ?"], ['B', "Les deux. C'est comme un raccourci par une ruelle sombre. Ça fait gagner du temps, jusqu'au jour où ça en fait perdre beaucoup."]],
  // ── superstitions et souvenirs ──
  [['A', "Parlons superstitions ! Les pilotes en ont tous ?"], ['B', "Tous. Ysée touche trois fois le tableau de bord avant chaque plongée. Tobbe embrasse une photo de sa grand-mère. Kaï chante."]],
  [['A', "Kaï Varon chante ? Quoi donc ?"], ['B', "Personne ne sait. Il coupe la radio avant. Mais les capteurs du cockpit montrent qu'il chante. Faux, apparemment."]],
  [['A', "Et toi, Mila, tu avais une superstition ?"], ['B', "Une chaussette porte-bonheur. Violette. Je l'ai portée pendant onze courses. Ma combinaison, elle, a fini par demander le divorce."]],
  [['A', "Ton plus beau souvenir de Fronde ?"], ['B', "Une sortie de géante, face à l'étoile qui se levait derrière les anneaux. Tout était doré. J'ai oublié la course pendant trois secondes. Les plus belles de ma vie."]],
  // ── les tribunes ──
  [['A', "Pendant ce temps, dans les tribunes installées sur les lunes, l'ambiance est incroyable !"], ['B', "Sur certaines lunes, ils ont construit des gradins dans les cratères. Pour voir passer les vaisseaux une demi-seconde. Une demi-seconde de bonheur."]],
  [['A', "Une demi-seconde pour des heures d'attente ?"], ['B', "C'est ça, la passion. Et entre deux passages, ils mangent, ils chantent, ils parient. Une vraie fête foraine dans le vide."]],
  [['A', "On me signale que les fans de la Mule ont apporté un tambour géant !"], ['B', "Dans le vide, le son ne se propage pas. Mais ils tapent quand même. C'est beau, la foi."]],
  // ── la tension monte ──
  [['A', "Mila, à ce stade de la course, qu'est-ce qui se passe dans la tête des pilotes ?"], ['B', "La fatigue commence à peser. Les réflexes ralentissent. C'est là que les erreurs arrivent, et que les grands pilotes se révèlent."]],
  [['A', "Et la stratégie évolue en cours de route ?"], ['B', "Complètement. Un pilote en retard devient audacieux. Un pilote en tête devient prudent. Le classement change le caractère des gens."]],
  [['A', "Tu crois que tout peut encore basculer ?"], ['B', "Dans la Fronde, tout peut toujours basculer. Une plongée ratée, une éruption au mauvais moment, et le premier devient dernier."]],
  [['A', "Restez avec nous, commandants : la Grande Fronde continue, et le meilleur reste à venir !"], ['B', "Et si vous devez partir, revenez vite. Les géantes, elles, ne vous attendront pas."]],
];
