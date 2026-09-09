// Shell source is kept in TypeScript so tsc produces a self-contained package.
export function bourneRuntime(shell: 'bash' | 'zsh'): string {
  return `__PREFIX__() {
${shell === 'zsh' ? zshInput : ''}
  local state=0 position=0 end=0 pending= pending_value=-1 pending_variadic=0
  local mode value=-1 variadic=0 next kind word current flag rest attached
  local i j count=0 candidate lead= raw_current="\${COMP_WORDS[COMP_CWORD]}"
  local -a tokens candidates flags
  COMPREPLY=()

  # Bash normally splits '=' into its own word. Reassemble option assignments.
  for ((i=1; i<=COMP_CWORD; i++)); do
    word=\${COMP_WORDS[i]}
    if ((count > 0)) && [[ $word == = && \${tokens[count-1]} == --* ]]; then
      tokens[count-1]+='='
    elif ((count > 0)) && [[ \${tokens[count-1]} == --*= && $word != = ]]; then
      tokens[count-1]+=$word
    else
      tokens[count]=$word
      ((count+=1))
    fi
  done
  current=\${tokens[count-1]}

  for ((i=0; i<count-1; i++)); do
    word=\${tokens[i]}
    if [[ -n $pending ]]; then
      if [[ $pending == required || $word != -* || $word == - ]]; then
        if ((pending_variadic)); then pending=optional; else pending=; fi
        continue
      fi
      pending=
    fi
    if (( ! end )) && [[ $word == -- ]]; then end=1; continue; fi
    if (( ! end )) && [[ $word == --* ]]; then
      __PREFIX___option "\${word%%=*}"
      if [[ -n $mode && $mode != boolean && $word != *=* ]]; then
        pending=$mode; pending_value=$value; pending_variadic=$variadic
      elif [[ $mode != boolean && -n $mode ]] && ((variadic)); then
        pending=optional; pending_value=$value; pending_variadic=1
      fi
      continue
    fi
    if (( ! end )) && [[ $word == -?* ]]; then
      rest=\${word:1}
      while [[ -n $rest ]]; do
        flag=-\${rest:0:1}; rest=\${rest:1}
        __PREFIX___option "$flag"
        if [[ -z $mode ]]; then break; fi
        if [[ $mode != boolean ]]; then
          if [[ -z $rest ]]; then
            pending=$mode; pending_value=$value; pending_variadic=$variadic
          elif ((variadic)); then
            pending=optional; pending_value=$value; pending_variadic=1
          fi
          break
        fi
      done
      continue
    fi
    if (( ! end && position == 0 )); then
      __PREFIX___child "$word"
      if [[ -n $next ]]; then state=$next; position=0; continue; fi
    fi
    __PREFIX___argument
    if (( ! variadic )); then ((position+=1)); fi
  done

  value=-1
  if [[ -n $pending ]] && { [[ $pending == required || $current != -* || $current == - ]]; }; then
    value=$pending_value
  elif (( ! end )) && [[ $current == --*=* ]]; then
    __PREFIX___option "\${current%%=*}"
    if [[ -z $mode || $mode == boolean ]]; then return 0; fi
    lead=\${current%%=*}=
    current=\${current#*=}
    # Readline replaces only the part after '=' when it is a word break.
    if [[ $COMP_WORDBREAKS == *=* && $raw_current != --*=* ]]; then lead=; fi
  elif (( ! end )) && [[ $current == -?* && $current != --* ]]; then
    rest=\${current:1}; attached=-
    while [[ -n $rest ]]; do
      flag=-\${rest:0:1}; attached+=\${rest:0:1}; rest=\${rest:1}
      __PREFIX___option "$flag"
      if [[ -z $mode ]]; then value=-1; break; fi
      if [[ $mode != boolean && -n $rest ]]; then lead=$attached; current=$rest; break; fi
      value=-1
    done
  fi

  if ((value >= 0)); then
    __PREFIX___values
  else
    __PREFIX___suggestions
    if ((end || position > 0)); then candidates=(); fi
    if (( ! end )); then candidates+=("\${flags[@]}"); fi
    local -a base=("\${candidates[@]}")
    __PREFIX___argument
    __PREFIX___values
    candidates=("\${base[@]}" "\${candidates[@]}")
  fi
  for candidate in "\${candidates[@]}"; do
    [[ $candidate == "$current"* ]] && COMPREPLY+=("$lead$candidate")
  done
${shell === 'bash' ? bashFiles : zshOutput}
  return 0
}
`;
}

const bashFiles = `  if [[ $kind == file || $kind == directory ]]; then
    local action=file
    [[ $kind == directory ]] && action=directory
    while IFS= read -r candidate; do
      COMPREPLY+=("$lead$candidate")
    done < <(compgen -A "$action" -- "$current")
    compopt -o filenames 2>/dev/null || :
  fi
`;

const zshInput = `  emulate -L ksh
  local -a COMP_WORDS=("\${words[@]}") COMPREPLY
  local COMP_CWORD=$((CURRENT - 1)) COMP_WORDBREAKS=
  # Ignore text after the cursor in the current token.
  COMP_WORDS[COMP_CWORD]=$PREFIX`;

const zshOutput = `  emulate -L zsh
  if ((\${#COMPREPLY[@]})); then compadd -- "\${COMPREPLY[@]}"; fi
  if [[ $kind == file || $kind == directory ]]; then
    # Native file completion handles quoting and directory suffixes.
    if [[ -n $lead ]]; then compset -P "\${(b)lead}"; fi
    if [[ $kind == directory ]]; then _files -/; else _files; fi
  fi`;
